
$(document).ready(function() {
  SVGInjector(document.querySelectorAll('img.svg-icon'));

  $('.extend-text.parsing .tooltip .handle').click(function() {
    $(this).parents('.tooltip').toggleClass('is-active');
  });
});
