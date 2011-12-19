describe("radio button convention binding", function(){
  beforeEach(function(){
    this.model = new AModel({
      graduated: "maybe",
      us_citizen: false
    });
    this.view = new AView({model: this.model});
    this.view.render();
  });

  it("bind view changes to the model's field, by convention of id", function(){
    var el = this.view.$("#graduated_no");
    el.attr("checked", "checked");
    el.trigger('change');
    expect(this.model.get('graduated')).toEqual("no");
  });

  it("bind model field changes to the form input, by convention of id", function(){
    this.model.set({graduated: "yes"});
    var el = this.view.$("#graduated_yes");
    var selected = el.attr("checked");

    expect(selected).toBeTruthy();
  });

  it("binds the model's value to the form field on render (graduated)", function(){
    var el = this.view.$("input[type=radio][name=graduated]:checked");
    var selected = el.val();

    expect(selected).toBe("maybe");
  });

  it("binds the model's value to the form field on render (us_citizen)", function(){
    var el = this.view.$("#us_citizen_false");
    expect(el.is(':checked')).toBe(true);
  });

  it("binds the view's value to the model, when there is no value in the model", function(){
    expect(this.model.get("another_radio")).toBeTruthy();
  });


});

describe("radio button convention binding - nested models", function () {

  beforeEach(function () {
    this.model = new AModel({
      favouriteColor: new AModel({ name: "red", brightness: "medium" }),
      otherFavouriteColors: new ACollection([
        { name: "purple", brightness: "dark", order: 1 },
        { name: "orange", brightness: "medium", order: 2 },
        { name: "yellow", brightness: "light", order: 3}], {
          comparator: function (item) { return item.get("order"); }
        })
    });
    this.view = new AViewBindingByName({ model: this.model });
    this.view.render();
  });

  describe("radio button binding to attr of nested model", function () {

    it("bind view changes to the model's field, by convention of name", function () {
      var el = this.view.$("#brightness_dark");
      el.attr("checked", "checked");
      el.trigger('change');
      expect(this.model.get('favouriteColor').get('brightness')).toEqual("dark");
    });

    it("bind model field changes to the form input, by convention of id", function () {
      this.model.get("favouriteColor").set({ brightness: "dark" });
      var el = this.view.$("#brightness_dark");
      var selected = el.attr("checked");

      expect(selected).toBeTruthy();
    });

    it("bind nested model instance changes to the form input, by convention of name", function () {
      var newColor = new AModel({ name: "black", brightness: "dark " });
      this.model.set({ favouriteColor: newColor });
      var el = this.view.$("#brightness_dark");
      var selected = el.attr("checked");
      expect(selected).toBeTruthy();
    });

    it("binds the model's value to the form field on render", function () {
      var el = this.view.$("input[type=radio][name=favouriteColor.\\brightness]:checked");
      var selected = el.val();

      expect(selected).toBe("medium");
    });

    it("binds the view's value to the model, when there is no value in the model", function () {
      expect(this.model.get("favouriteColor").get("anotherProp")).toEqual("value2");
    });
  });

  describe("radio button binding to attr of model in nested collection", function () {

    it("bind view changes to the model's field, by convention of name", function () {
      var el = this.view.$("#otherFavouriteColors_1_brightness_dark");
      el.attr("checked", "checked");
      el.trigger('change');
      expect(this.model.get("otherFavouriteColors").at(1).get('brightness')).toEqual("dark");
    });

    it("bind nested model field changes to the form input, by convention of name", function () {
      var nestedModel = this.model.get("otherFavouriteColors").at(1);
      nestedModel.set({ brightness: "dark" });
      var el = this.view.$("#otherFavouriteColors_1_brightness_dark");
      expect(el.attr("checked")).toBeTruthy();

      nestedModel.set({ brightness: "medium" });
      el = this.view.$("#otherFavouriteColors_1_brightness_medium");
      expect(el.attr("checked")).toBeTruthy();
    });

    it("bind nested collection instance changes to the form input, by convention of name", function () {
      var newCollection = new ACollection([{ name: "black", brightness: "dark", order: 1 },
          { name: "beige", brightness: "light", order: 2}]);
      this.model.set({ otherFavouriteColors: newCollection });
      var el = this.view.$("#otherFavouriteColors_1_brightness_light");
      var selected = el.attr("checked");
      expect(selected).toBeTruthy();
    });

    it("bind nested collection item changes to the form input, by convention of name", function () {
      var newColor = new AModel({ name: "black", brightness: "dark", order: 1.5 });
      this.model.get("otherFavouriteColors").add(newColor); // see comparator - item will be at index 1
      var el = this.view.$("#otherFavouriteColors_1_brightness_dark");
      var selected = el.attr("checked");
      expect(selected).toBeTruthy();
    });

    it("binds the model's value to the form field on render", function () {
      var el = this.view.$("input[type=radio][name=otherFavouriteColors\\[1\\]\\.brightness]:checked");
      var selected = el.val();

      expect(selected).toBe("medium");
    });

    it("binds the view's value to the model, when there is no value in the model", function () {
      expect(this.model.get("otherFavouriteColors").at(1).get("anotherProp")).toEqual("value2");
    });
  });

});
