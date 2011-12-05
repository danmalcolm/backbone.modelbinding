describe("Model Access", function () {
  Backbone.ModelBinding.ModelAccess = (function () {

    // Converts path expression string, e.g. "manufacturer.name" to a sequence of objects with data about
    // the parts of the expression
    var parsePathExpression = function () {
      var error = function (description) {
        var message = "Unexpected syntax at position " + index + " in model path '" + text + "': " + description;
        throw {
          name: "SyntaxError",
          message: message,
          index: index,
          text: text
        };
      },
        expressionChain = function () {
          var result = [], first = true;
          white();
          while (current) {
            result.push(expression(first));
            if (white() && current) { // there was some whitespace but not at end, oh no!
              error("Unexpected whitespace in middle of path");
            }
            first = false;
          }
          return result;
        },
        expression = function (first) {
          switch (current) {
            case "[":
              return collectionItemAccess(first);
            default:
              return attributeAccess(first);
          }
        },
        collectionItemAccess = function () {
          var number;
          next("[");
          white();
          number = integer();
          white();
          next("]");
          return { type: "collectionItemAccess", index: number, text: "[" + number + "]" };
        },
        integer = function () {
          var number, string = "";
          while (current >= "0" && current <= "9") {
            string += current;
            next();
          }
          if (!string) {
            error("Expected a positive number");
          }
          number = +string;
          return number;
        },
        attributeAccess = function (first) {
          var text = "", attrName;
          if (!first) {
            text = next(".");
          }
          attrName = name();
          text += attrName;
          return { type: "attributeAccess", name: attrName, text: text };
        },
        name = function () {
          var string = "";
          if (!/[A-Za-z_]/.test(current)) {
            error("Names used to access an attribute must start with a character or underscore");
          }
          string += next();
          while (/[A-Za-z_0-9]/.test(current)) {
            string += next();
          }
          return string;
        },
        next = function (expected) {
          if (expected && expected != current) {
            error("Expected '" + expected + "' instead of '" + current + "'");
          }
          var previous = text.charAt(index);
          index += 1;
          current = text.charAt(index);
          return previous;
        },
        white = function () {
          var space = "";
          while (current && current <= ' ') {
            space += next();
          }
          return space;
        };
      var text, index, current;
      return function (path) {
        var result;
        text = path;
        index = 0;
        current = (text.length > 0) ? text[index] : "";
        result = expressionChain();
        if (current) {
          error("Unrecognised syntax");
        }
        return result;
      };
    } ();

    // ----------------------------
    // Accessors - Responsible for getting / setting values specified by a path expression (e.g."manufacturer.name") 
    // on a target object (Backbone model or collection). 
    // 
    // A deep path will result in a chain of accessors, for example, an accessor for path "manufacturer.name" would 
    // result in the following hierarchy:
    //
    // RootAccessor - retrieves the root model
    // > AttrAccessor - retrieves the "manufacturer" attr of the root model
    //   > AttrAccessor - retrieves the "name" attr of the Model referenced by parent "manufacturer" expression
    //
    // Accessors do not hold a reference to a specific target but are used by ModelChangeTracker (below) for:
    // 1. accessing attr values
    // 2. binding events to models and collections along the chain
    // ----------------------------

    // References the root model at the start of a chain of access expressions
    var RootAccessor = function () {
      this.get = function (target) {
        return target;
      };
      this.bindToTarget = function () {
        return [];
      };
    };

    // Accesses an attribute of a Backbone.Model instance
    var AttrAccessor = function (parent, expression) {
      this.get = function (target) {
        var model = this.getModel(target);
        return model ? model.get(expression.name) : undefined;
      };
      this.set = function (target, value) {
        var model = this.getModel(target);
        if (model) {
          var attrs = {};
          attrs[expression.name] = value;
          model.set(attrs);
        }
      },
      this.getModel = function (target) {
        var model = parent.get(target);
        if (!model) {
          return model;
        }
        if (!model instanceof Backbone.Model)
          throw new Error('The object referenced by expression "' + expression.text + '" is not a Backbone model and is not suitable for modelbinding');
        return model;
      };
      this.bindToTarget = function (target, callback, context) {
        var eventBindings = [];
        var model = parent.get(target);
        if (model instanceof Backbone.Model) {
          var event = "change:" + expression.name;
          model.bind(event, callback, context);
          eventBindings.push(new TargetEventBinding(model, [event]));
        }
        var parentEventBindings = parent.bindToTarget(target, callback, context);
        return eventBindings.concat(parentEventBindings);
      };
    };
    AttrAccessor.expressionType = "attributeAccess";

    // Access model within a Backbone.Collection by index
    var CollectionItemAccessor = function (parent, expression) {
      this.get = function (model) {
        var collection = parent.get(model);
        if (collection instanceof Backbone.Collection) {
          return collection.at(expression.index);
        } else {
          // could support arrays, but no events on add / remove
          throw new Error("Unable to access collection item because the object is not a Backbone collection");
        }
      };
      this.set = function (target, value) {
        throw ("Setting a collection item is not supported by modelbinding. Elements in the view can only be bound to the attributes of collection items, not the collection items themselves");
      };
      this.bindToTarget = function (target, callback, context) {
        var eventBindings = [];
        var collection = parent.get(target);
        if (collection instanceof Backbone.Collection) {
          // track events that affect position of item
          var events = ["add", "remove", "reset"];
          _.each(events, function (event) {
            collection.bind(event, callback, context);
          });
          eventBindings.push(new TargetEventBinding(collection, events));
        }
        var parentEventBindings = parent.bindToTarget(target, callback, context);
        return eventBindings.concat(parentEventBindings);
      };
    };
    CollectionItemAccessor.expressionType = "collectionItemAccess";

    // Tracks model or collection events bound to the "change" callback of ModelChangeTracker
    // so they can be unbound
    var TargetEventBinding = function (target, events) {
      this.unbindFromTarget = function (callback) {
        _.each(events, function (event) {
          target.unbind(event, callback);
        }, this);
      };
    };

    var accessorTypes = [AttrAccessor, CollectionItemAccessor];

    var buildAccessor = function (path) {
      var expressions = parsePathExpression(path);
      var accessor = _.reduce(expressions, function (parent, expression) {
        var accessorType = _.detect(accessorTypes, function (a) { return a.expressionType === expression.type; });
        return new accessorType(parent, expression);
      }, new RootAccessor(), this);

      return accessor;
    };

    // ----------------------------
    // ModelChangeTracker - Manages get / set of attr specified by a path expression and monitors for changes to
    // the specified attribute// 
    // ----------------------------
    var ModelChangeTracker = function (target, accessor) {
      this.target = target;
      this.accessor = accessor;
      this.currentValue = this.getValue(this.target);
      this.currentBindings = [];
      this.bindToTargets();
    };
    _.extend(ModelChangeTracker.prototype, Backbone.Events, {
      change: function () {
        this.triggerChange();
        // As any target along chain could have changed, we need to rebind to each.
        // (certain types of change (attr at end of chain) don't require rebinding 
        // but simpler just to rebind)
        this.unbindFromTargets();
        this.bindToTargets();
      },
      triggerChange: function () {
        var value = this.getValue();
        if (value !== this.currentValue) {
          this.trigger("change", { value: value });
        }
        this.currentValue = value;
      },
      unbindFromTargets: function () {
        _.each(this.currentBindings, function (b) { b.unbindFromTarget(); });
      },
      bindToTargets: function () {
        this.currentBindings = this.accessor.bindToTarget(this.target, this.change, this);
      },
      getValue: function () {
        return this.accessor.get(this.target);
      },
      setValue: function (value) {
        this.accessor.set(this.target, value);
      }
    });

    return {
      accessorFor: function (path) {
        var accessor = buildAccessor(path);
        return accessor;
      },
      changeTrackerFor: function (target, path) {
        var accessor = this.accessorFor(path);
        var binder = new ModelChangeTracker(target, accessor);
        return binder;
      }
    };
  })();

  var ModelAccess = Backbone.ModelBinding.ModelAccess;
  var Product = Backbone.Model.extend({});
  var Manufacturer = Backbone.Model.extend({});
  var Review = Backbone.Model.extend({});
  var ReviewCollection = Backbone.Collection.extend({
    model: Review,
    comparator: function (model) { return model.get("date"); }
  });

  var product, manufacturer1, manufacturer2, review1, review2, review3;

  beforeEach(function () {
    manufacturer1 = new Manufacturer({ code: "M1", name: "Manufacturer 1" });
    manufacturer2 = new Manufacturer({ code: "M2", name: "Manufacturer 2" });
    review1 = new Review({ title: "Review 1", date: new Date(2012, 1, 1) });
    review2 = new Review({ title: "Review 2", date: new Date(2012, 1, 10) });
    review3 = new Review({ title: "Review 3", date: new Date(2012, 1, 20) });
    product = new Product({
      code: "P1",
      name: "Product 1",
      manufacturer: manufacturer1,
      reviews: new ReviewCollection([review1, review2, review3])
    });
  });

  describe("Attr Accessor Creation", function () {

    var bad = function (path) {
      //modelAccess.accessorFor(path); // uncomment to see the exception
      expect(function () { return ModelAccess.accessorFor(path); }).toThrow();
    };

    var good = function (path, target, expected) {
      var accessor = ModelAccess.accessorFor(path);
      var value = accessor.get(target);
      expect(value).toEqual(expected);
    };

    it("should throw with illegal attr name", function () {
      bad("9asdf");
    });

    it("should throw with whitespace in middle of path", function () {
      bad("reviews name");
    });

    it("should throw with letters in collection index", function () {
      bad("reviews[asdf]");
    });

    it("should throw with numbers followed by letters in collection index", function () {
      bad("reviews[0ddf]");
    });

    it("should throw with letters followed by numbers in collection index", function () {
      bad("reviews[asd0]");
    });

    it("should throw with trailing dot", function () {
      bad("manufacturer.");
    });

    it("should throw with leading dot", function () {
      bad(".manufacturer");
    });

    it("should access attr of target model", function () {
      good("name", product, "Product 1");
    });

    it("should identify attr of target model when whitespace at start", function () {
      good("  name", product, "Product 1");
    });

    it("should identify attr of target model when whitespace at end", function () {
      good("name  ", product, "Product 1");
    });

    it("should identify attr of nested model", function () {
      good("manufacturer.name", product, "Manufacturer 1");
    });

    it("should identify attr of model in nested collection", function () {
      good("reviews[1].title", product, "Review 2");
    });

    it("should identify attr of model in nested collection when whitespace around position", function () {
      good("reviews[ 1 ].title", product, "Review 2");
    });

    it("should identify attr of model in target collection", function () {
      var collection = product.get("reviews");
      good("[1].title", collection, "Review 2");
    });
  });


  describe("Model Change Tracking", function () {

    var changeTracker;
    var changeTrackerEvents = [];

    beforeEach(function () {
      changeTrackerEvents = [];
      this.addMatchers({

        toContainEventsWithValues: function (expectedValues) {
          var events = this.actual;
          var actualValues = _.pluck(events, "value");
          this.message = function () {
            return "Expected a sequence of change events with values " + JSON.stringify(expectedValues) + " but actual values were " + JSON.stringify(actualValues);
          };
          return _.isEqual(actualValues, expectedValues);
        },
        toContainNoEvents: function () {
          var events = this.actual;
          var actualValues = _.pluck(events, "value");
          this.message = function () {
            return "Expected no values changes to be recorded, but actual values were " + JSON.stringify(actualValues);
          };
          return actualValues.length == 0;
        },
        toHaveAttrValue: function (attr, expectedValue) {
          var model = this.actual;
          var actualValue = model.get(attr);
          this.message = function () {
            return "Expected value of attr to be " + JSON.stringify(expectedValue) + " but was " + JSON.stringify(actualValue);
          };
          return actualValue === expectedValue;
        }
      });
    });

    var createAccessor = function (target, path) {
      changeTracker = ModelAccess.changeTrackerFor(target, path);
      changeTracker.bind("change", function (event) {
        changeTrackerEvents.push(event);
      });
    };

    describe("When bound to attr of target model", function () {

      beforeEach(function () {
        createAccessor(product, "name");
      });

      it("should notify of changes to attr", function () {
        product.set({ name: "New Name!" });
        expect(changeTrackerEvents).toContainEventsWithValues(["New Name!"]);
      });

      it("should be able to set attr", function () {
        changeTracker.setValue("New Name!");
        expect(product).toHaveAttrValue("name", "New Name!");
      });
    });

    describe("When bound to attr of nested model", function () {

      beforeEach(function () {
        createAccessor(product, "manufacturer.name");
      });

      it("should notify of changes to attr", function () {
        product.get("manufacturer").set({ name: "New Name!" });
        expect(changeTrackerEvents).toContainEventsWithValues(["New Name!"]);
      });

      it("should be able to set attr", function () {
        changeTracker.setValue("New Name!");
        expect(product.get("manufacturer")).toHaveAttrValue("name", "New Name!");
      });

      it("should notify when nested model unset, resulting in undefined value", function () {
        product.unset("manufacturer");
        expect(changeTrackerEvents.length).toEqual(1);
        expect(changeTrackerEvents).toContainEventsWithValues([undefined]);
      });

      it("should notify when nested model set to null, resulting in undefined value", function () {
        product.set({ manufacturer: null });
        expect(changeTrackerEvents.length).toEqual(1);
        expect(changeTrackerEvents).toContainEventsWithValues([undefined]);
      });

      it("should retrieve undefined value when nested model is null", function () {
        product.set({ manufacturer: null });
        expect(changeTracker.getValue()).toBeUndefined();
      });

      it("should notify when parent nested model changes", function () {
        product.set({ manufacturer: manufacturer2 });
        expect(changeTrackerEvents.length).toEqual(1);
        expect(changeTrackerEvents[0].value).toEqual(manufacturer2.get("name"));
      });

      it("should not notify about changes to original nested model after it has been replaced", function () {
        product.set({ manufacturer: manufacturer2 });
        changeTrackerEvents = [];
        manufacturer1.set({ name: "New Name!!" });
        expect(changeTrackerEvents).toContainNoEvents();
      });

      it("should unbind from nested model when it has been replaced", function () {
        product.set({ manufacturer: manufacturer2 });
        expect(manufacturer1._callbacks["change:name"]).toEqual([]);
      });

      it("should not trigger change if nested model changed to model with equal attr value", function () {
        manufacturer2.set({ name: manufacturer1.get("name") });
        product.set({ manufacturer: manufacturer2 });
        expect(changeTrackerEvents).toContainNoEvents();
      });


    });

    describe("When bound to attr of model at specified position in nested collection", function () {
      var collection;

      beforeEach(function () {
        createAccessor(product, "reviews[1].title");
        collection = product.get("reviews");
      });

      it("should notify of changes to attr", function () {
        collection.at(1).set({ title: "New Title!" });
        expect(changeTrackerEvents).toContainEventsWithValues(["New Title!"]);
      });

      it("should be able to set attr", function () {
        changeTracker.setValue("New Title!");
        expect(collection.at(1)).toHaveAttrValue("title", "New Title!");
      });

      it("should notify when item removed, which results in different model at specified position", function () {
        collection.remove(collection.at(1));
        expect(changeTrackerEvents).toContainEventsWithValues([review3.get("title")]);
      });

      it("should notify when item added, resulting in different model at specified position", function () {
        var date = new Date(review2.get("date"));
        date.setDate(date.getDate() - 1);
        var newReview = new Review({ title: "New Review!", date: date });
        collection.add(newReview); // Collection sorted by date, so newReview will by in position 1
        expect(changeTrackerEvents).toContainEventsWithValues([newReview.get("title")]);
      });

    });

  });

});