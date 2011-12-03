describe("Model Attr Accessor", function() {

  var ModelAttrAccessor = (function() {

    var parse = function() {
      var text, index, current;

      var error = function(description) {
        var message = "Unexpected syntax at position " + index + " in model path '" + text + "': " + description;
        throw {
          name: "SyntaxError",
          message: message,
          index: index,
          text: text
        };
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
          while (current && current <= ' ') {
            next();
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
            error("Expected integer");
          }
          number = +string;
          return number;
        },
        attributeAccess = function() {
          var text = "", attrName;
          if (index > 0) {
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
        expression = function() {
          switch (current) {
            case "[":
              return collectionItemAccess();
            default:
              return attributeAccess();
          }
        },
        expressions = function() {
          var result = [];
          white();
          while (current) {
            result.push(expression());
          }
          white();
          return result;
        };
      return function(path) {
        var result;
        text = path;
        index = 0;
        current = (text.length > 0) ? text[index] : "";
        result = expressions();
        if (current) {
          error("Unrecognised syntax");
        }
        return result;
      };
    } ();

    // References the root model at the start of a chain of access expressions
    var RootAccessor = function() {
      this.get = function(model) {
        return model;
      };
    };

    var AttrAccessor = function(parent, expression) {
      this.get = function(model) {
        var target = parent.get(model);
        if (target instanceof Backbone.Model)
          return target.get(expression.name);
        else
          throw new Error('The object referenced by expression "' + expression.text + '" is not a Backbone model and is not suitable for databinding');
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

    var accessors = [AttrAccessor, CollectionItemAccessor];

    var buildAccessor = function(path) {
      var expressions = parse(path);
      var accessor = _.reduce(expressions, function(parent, expression) {
        var accessor = _.detect(accessors, function(a) { return a.expressionType === expression.type; });
        return new accessor(parent, expression);
      }, new RootAccessor(), this);

      return accessor;
    };

    var ModelAttrAccessor = function(path) {
      this.accessor = buildAccessor(path);
      this.getValue = function(model) {
        return this.accessor.get(model);
      };
    };

    return ModelAttrAccessor;
  })();

  describe("Creation", function() {

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

    var bad = function(path) {
      expect(function() { return new ModelAttrAccessor(path); }).toThrow();
    };

    var good = function(path, target, expected) {
      var accessor = new ModelAttrAccessor(path);
      var value = accessor.getValue(target);
      expect(value).toEqual(expected);
    };

    it("should throw with invalid attr name", function() {
      bad("9asdf");
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

    it("should access attr of nested model", function() {
      good("manufacturer.name", product, "Manufacturer 1");
    });

    it("should access attr of model in specified position in nested collection", function() {
      good("reviews[1].title", product, "Review 2");
    });

    it("should access attr of model in specified position including whitespace in nested collection", function() {
      good("reviews[ 1 ].title", product, "Review 2");
    });

    it("should access attr of model in target collection", function() {
      var collection = product.get("reviews");
      good("[1].title", collection, "Review 2");
    });
  });


  describe("Value binding", function() {

    var Product = Backbone.Model.extend({});
    var Manufacturer = Backbone.Model.extend({});
    var Review = Backbone.Model.extend({});

    var product, manufacturer1, manufacturer2, review1, review2, review3;

    beforeEach(function() {
      manufacturer1 = new Manufacturer({ code: "M1", name: "Manufacturer 1" });
      manufacturer2 = new Manufacturer({ code: "M2", name: "Manufacturer 2" });
      review1 = new Review({ name: "Review 1" });
      review2 = new Review({ name: "Review 2" });
      review3 = new Review({ name: "Review 3" });
      product = new Product({ code: "P1", name: "Product 1", manufacturer: manufacturer1, reviews: [review1, review2, review3] });
    });

    /*
    test("When accessing attr of model in array", function() {
    var accessor = new ModelGraphPath("reviews[0].name");
    var value = accessor.getValue(product);
    equal(value, "Review 1", "Should retrieve attr from model in array");
    });

    test("When accessing attr of child model", function() {
    var accessor = new ModelGraphPath("manufacturer.name");
    var value = accessor.getValue(product);
    equal(value, "Manufacturer 1", "Should retrieve attr value from model");
    });
    */

    describe("when accessing attr of root model", function() {
      beforeEach(function() {
        this.accessor = new ModelAttrAccessor("name");
      });

      it("should get value of attr", function() {
        var value = this.accessor.getValue(product);
        expect(value).toEqual("Product 1");
      });

      it("should get updated value of attr", function() {
        product.set({ name: "New Name" });
        var value = this.accessor.getValue(product);
        expect(value).toEqual("New Name");
      });
    });

    describe("when accessing attr of nested model", function() {
      beforeEach(function() {
        this.accessor = new ModelAttrAccessor("manufacturer.name");
      });

      it("should get value", function() {
        var value = this.accessor.getValue(product);
        expect(value).toEqual("Manufacturer 1");
      });

      it("should get value of new nested model when set", function() {
        product.set({ manufacturer: manufacturer2 });
        var value = this.accessor.getValue(product);
        expect(value).toEqual("Manufacturer 2");
      });
    });

    describe("when accessing attr of model in nested array", function() {
      beforeEach(function() {
        this.accessor = new ModelAttrAccessor("reviews[1].name");
      });

      it("should get value", function() {
        var value = this.accessor.getValue(product);
        expect(value).toEqual("Review 2");
      });
    });

  });

});