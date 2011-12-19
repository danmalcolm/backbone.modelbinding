describe("textbox convention bindings", function(){
  beforeEach(function(){
    var color = new AModel({ name: "blue" });
    var otherFavouriteColors = new ACollection([ { name: "red"}, { name: "orange"}, { name: "yellow" }]);
    this.model = new AModel({
      name: "Ashelia Bailey", 
      noType: 'there is no type',
      favouriteColor: color,
      otherFavouriteColors: otherFavouriteColors
    });
    this.view = new AView({model: this.model});
  });

  describe("text element binding", function(){
    beforeEach(function(){
      this.view.render();
      this.el = this.view.$("#name");
    });

    it("bind view changes to the model's field, by convention of id", function(){
      this.el.val("Derick Bailey");
      this.el.trigger('change');

      expect(this.model.get('name')).toEqual("Derick Bailey");
    });

    it("bind model field changes to the form input, by convention of id", function(){
      this.model.set({name: "Ian Bailey"});
      expect(this.el.val()).toEqual("Ian Bailey");
    });

    it("binds the model's value to the form field on render", function(){
      expect(this.el.val()).toEqual("Ashelia Bailey");
    });
  });
  
  describe("when the form field has a value but the model does not", function(){
    beforeEach(function(){
      this.view.render();
      var el = this.view.$("#prefilled_name");
    });

    it("binds the form field's value to the model, on render", function(){
      expect(this.model.get("prefilled_name")).toBe("a name");
    });
  });

  describe("input with no type specified, binding", function(){
    beforeEach(function(){
      this.view.render();
      this.el = this.view.$("#noType");
    });

    it("bind view changes to the model's field, by convention of id", function(){
      this.el.val("something changed");
      this.el.trigger('change');

      expect(this.model.get('noType')).toEqual("something changed");
    });

    it("bind model field changes to the form input, by convention of id", function(){
      this.model.set({noType: "Ian Bailey"});
      expect(this.el.val()).toEqual("Ian Bailey");
    });

    it("binds the model's value to the form field on render", function(){
      expect(this.el.val()).toEqual("there is no type");
    });
  });
});

// TODO: if introducing nested models using "." to navigate, maybe default binding attr should be name - separate view for now though

describe("textbox convention bindings - nested models", function () {
  beforeEach(function () {
    var color = new AModel({ name: "blue" });
    var otherFavouriteColors = new ACollection([{ name: "red" }, { name: "orange" }, { name: "yellow"}]);
    this.model = new AModel({
      name: "Ashelia Bailey",
      noType: 'there is no type',
      favouriteColor: color,
      otherFavouriteColors: otherFavouriteColors
    });
    this.view = new AViewBindingByName({ model: this.model });
  });

  describe("text element binding to attr of nested model", function () {
    beforeEach(function () {
      this.view.render();
      this.el = this.view.$("[name=favouriteColor\\.name]");
    });

    it("bind view changes to the nested model's attr, by convention of name", function () {
      this.el.val("pink");
      this.el.trigger("change");

      expect(this.model.get("favouriteColor").get("name")).toEqual("pink");
    });

    it("bind nested model attr changes to the form input, by convention of name", function () {
      this.model.get("favouriteColor").set({ name: "red" });
      expect(this.el.val()).toEqual("red");
      this.model.get("favouriteColor").set({ name: "orange" });
      expect(this.el.val()).toEqual("orange");
      this.model.get("favouriteColor").set({ name: "yellow" });
      expect(this.el.val()).toEqual("yellow");
    });

    it("binds the model's value to the form field on render", function () {
      expect(this.el.val()).toEqual("blue");
    });
  });


  describe("text element binding to attr of model in nested collection", function () {
    beforeEach(function () {
      this.view.render();
      this.el = this.view.$("[name=otherFavouriteColors\\[1\\]\\.name]");
      this.nestedModel = this.model.get("otherFavouriteColors").at("1");
    });

    it("bind view changes to the nested model's attr, by convention of name", function () {
      this.el.val("red");
      this.el.trigger('change');

      expect(this.nestedModel.get("name")).toEqual("red");
    });

    it("bind nested model attr changes to the form input, by convention of name", function () {
      this.nestedModel.set({ name: "red" });
      expect(this.el.val()).toEqual("red");
      this.nestedModel.set({ name: "orange" });
      expect(this.el.val()).toEqual("orange");
      this.nestedModel.set({ name: "yellow" });
      expect(this.el.val()).toEqual("yellow");
    });

    it("binds the model's value to the form field on render", function () {
      expect(this.el.val()).toEqual("orange");
    });
  });
});