function a() {
  this;
  arguments;
  var b = () => this + arguments + (() => this + arguments);
  function c() {
    this;
    arguments;
    var d = () => this + arguments + (() => this + arguments);
  }
  var e = () => function () {
    this;
    arguments;
    var f = () => this + arguments + (() => this + arguments);
  };
}
