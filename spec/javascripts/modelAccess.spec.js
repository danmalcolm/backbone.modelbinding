describe("Model Access", function () {
 
  var modelAccess = Backbone.ModelBinding.modelAccess;
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
      expect(function () { return modelAccess.accessorFor(path); }).toThrow();
    };

    var good = function (path, target, expected) {
      var accessor = modelAccess.accessorFor(path);
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

    it("should throw with leading whitespace in collection index", function () {
      bad("reviews[  0]");
    });

    it("should throw with trailing whitespace in collection index", function () {
      bad("reviews[0  ]");
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
      changeTracker = modelAccess.changeTrackerFor(target, path);
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

      it("should indicate that attr exists", function () {
        expect(changeTracker.hasValue()).toBeTruthy();
      });

      it("should indicate that attr does not exist if unset", function () {
        product.unset("name");
        expect(changeTracker.hasValue()).toBeFalsy();
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