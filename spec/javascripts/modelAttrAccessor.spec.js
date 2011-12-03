describe("Model Attr Accessor", function() {

  var ModelAttrAccessor = (function() {

    var parse = function() {
      var error = function(description) {
        var message = "Unexpected syntax at position " + index + " in model path '" + text + "': " + description;
        throw {
          name: "SyntaxError",
          message: message,
          index: index,
          text: text
        };
      },
        expressionChain = function() {
          var result = [], first = true;
          white();
          while (current) {
            result.push(expression(first));
            if (white() && current) { // whitespace gobbled but more left, oh no!
              error("Unexpected whitespace in middle of path");
            }
            first = false;
          }
          return result;
        },
        expression = function(first) {
          switch (current) {
            case "[":
              return collectionItemAccess(first);
            default:
              return attributeAccess(first);
          }
        },
        collectionItemAccess = function() {
          var number;
          next("[");
          white();
          number = integer();
          white();
          next("]");
          return { type: "collectionItemAccess", index: number, text: "[" + number + "]" };
        },
        integer = function() {
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
        attributeAccess = function(first) {
          var text = "", attrName;
          if (!first) {
            text = next(".");
          }
          attrName = name();
          text += attrName;
          return { type: "attributeAccess", name: attrName, text: text };
        },
        name = function() {
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
        next = function(expected) {
          if (expected && expected != current) {
            error("Expected '" + expected + "' instead of '" + current + "'");
          }
          var previous = text.charAt(index);
          index += 1;
          current = text.charAt(index);
          return previous;
        },
        white = function() {
          var space = "";
          while (current && current <= ' ') {
            space += next();
          }
          return space;
        };
      var text, index, current;
      return function(path) {
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

    // References the root model at the start of a chain of access expressions
    var RootAccessor = function() {
      this.get = function(target) {
        return target;
      };
      this.bindToChangeEvents = function(target, callback, context) {
        // Root model can't change
      };
    };

    var AttrAccessor = function(parent, expression) {
      this.get = function(target) {
        var model = parent.get(target);
        if (model instanceof Backbone.Model)
          return model.get(expression.name);
        else
          throw new Error('The object referenced by expression "' + expression.text + '" is not a Backbone model and is not suitable for databinding');
      };
      this.bindToChangeEvents = function(target, callback, context) {
        var model = parent.get(target);
        if (model instanceof Backbone.Model) {
          model.bind("change:" + expression.name,callback,context);
        }
      };
    };
    AttrAccessor.expressionType = "attributeAccess";

    var CollectionItemAccessor = function(parent, expression) {
      this.get = function(model) {
        var collection = parent.get(model);
        if (_.isArray(collection)) {
          return collection[expression.index];
        } else if (collection instanceof Backbone.Collection) {
          return collection.at(expression.index);
        } else {
          throw new Error("Unable to access collection item because the object is not an array or Backbone collection");
        }
      };
    };
    CollectionItemAccessor.expressionType = "collectionItemAccess";

    var accessorTypes = [AttrAccessor, CollectionItemAccessor];

    var buildAccessor = function(path) {
      var expressions = parse(path);
      var accessor = _.reduce(expressions, function(parent, expression) {
        var accessorType = _.detect(accessorTypes, function(a) { return a.expressionType === expression.type; });
        return new accessorType(parent, expression);
      }, new RootAccessor(), this);

      return accessor;
    };

    var AttrBinder = function(target, path) {
      this.target = target;
      this.accessor = buildAccessor(path);
      this.initialize();
    };
    _.extend(AttrBinder.prototype, Backbone.Events, {
      initialize: function() {
        this.rebind();
      },
      change: function() {
        this.rebind();
        var value = this.accessor.get(target);
        this.trigger("change", value);
      },
      rebind: function() {
        this.accessor.bindToChangeEvents(this.target, this.change, this);
      }
    });

    return {
      accessorFor: function(path) {
        var accessor = buildAccessor(path);
        return accessor;
      },
      attrBinderFor: function(target, path) {
        var accessor = this.accessorFor(path);
        var binder = new AttrBinder(target, accessor);
        return binder;
      }
    };
  })();

  var Product = Backbone.Model.extend({});
  var Manufacturer = Backbone.Model.extend({});
  var Review = Backbone.Model.extend({});
  var ReviewCollection = Backbone.Collection.extend({
    model: Review
  });

  var product, manufacturer1, manufacturer2, review1, review2, review3;

  beforeEach(function() {
    manufacturer1 = new Manufacturer({ code: "M1", name: "Manufacturer 1" });
    manufacturer2 = new Manufacturer({ code: "M2", name: "Manufacturer 2" });
    review1 = new Review({ title: "Review 1" });
    review2 = new Review({ title: "Review 2" });
    review3 = new Review({ title: "Review 3" });
    product = new Product({
      code: "P1",
      name: "Product 1",
      manufacturer: manufacturer1,
      reviews: new ReviewCollection([review1, review2, review3])
    });
  });

  describe("Attr Accessor Creation", function() {

    var bad = function(path) {
      //ModelAttrAccessor.create(path); // uncomment to see the exception
      expect(function() { return ModelAttrAccessor.accessorFor(path); }).toThrow();
    };

    var good = function(path, target, expected) {
      var accessor = ModelAttrAccessor.accessorFor(path);
      var value = accessor.get(target);
      expect(value).toEqual(expected);
    };

    it("should throw with illegal attr name", function() {
      bad("9asdf");
    });

    it("should throw with whitespace in middle of path", function() {
      bad("reviews name");
    });

    it("should throw with letters in collection index", function() {
      bad("reviews[asdf]");
    });

    it("should throw with numbers followed by letters in collection index", function() {
      bad("reviews[0ddf]");
    });

    it("should throw with letters followed by numbers in collection index", function() {
      bad("reviews[asd0]");
    });

    it("should throw with trailing dot", function() {
      bad("manufacturer.");
    });

    it("should throw with leading dot", function() {
      bad(".manufacturer");
    });

    it("should access attr of target model", function() {
      good("name", product, "Product 1");
    });

    it("should access attr of target model with whitespace at start", function() {
      good("  name", product, "Product 1");
    });

    it("should access attr of target model with whitespace at end", function() {
      good("name  ", product, "Product 1");
    });

    it("should access attr of nested model", function() {
      good("manufacturer.name", product, "Manufacturer 1");
    });

    it("should access attr of model in nested collection", function() {
      good("reviews[1].title", product, "Review 2");
    });

    it("should access attr of model in nested collection with whitespace around position", function() {
      good("reviews[ 1 ].title", product, "Review 2");
    });

    it("should access attr of model in target collection", function() {
      var collection = product.get("reviews");
      good("[1].title", collection, "Review 2");
    });
  });


  describe("Value binding", function() {

    describe("When binding to attr of nested model", function() {
      var accessor;
      var events = [];

      beforeEach(function() {
        accessor = ModelAttrAccessor.attrBinderFor(product, "manufacturer.name");
        accessor.bind("change", function(event, value) {
          events.push({ event: event, value: value });
        });
      });

      it("should notify of changes to attr", function() {
        product.get("manufacturer").set({ name: "New Name!" });
        expect(events.length).toEqual(1);
        expect(events[0].value).toEqual("New Name!");
      });

      it("should notify when parent nested model changes", function() {
        product.set({ manufacturer: manufacturer2 });
        expect(events.length).toEqual(1);
        expect(events[0].value).toEqual(manufacturer2.get("name"));
      });

      it("should unbind from events on previous model when parent nested model changes", function() {
        product.set({ manufacturer: manufacturer2 });
        events = [];
        manufacturer1.set({ name: "New Name!!" });
        expect(events.length).toEqual(0);
      });

      it("should not notify when parent nested model changes if attr value unchanged", function() {
        manufacturer2.set({ Name: manufacturer1.Name });
        product.set({ manufacturer: manufacturer2 });
        expect(events.length).toEqual(0);
      });


    });

  });

});