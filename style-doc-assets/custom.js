
$(document).ready(function() {
  SVGInjector(document.querySelectorAll('img.svg-icon'));

  $('.extend-text.parsing .tooltip .handle').click(function() {
    $(this).parents('.tooltip').toggleClass('is-active');
  });

  $('.input-element .tooltip .handle').mouseenter(function() {
    $(this).parents('.tooltip').addClass('is-active');
  });

  $('.input-element .tooltip .handle').mouseleave(function() {
    $(this).parents('.tooltip').removeClass('is-active');
  });
});
