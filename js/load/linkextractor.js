(function($) {

	function shorten(s) {
		return s.replace(/^(https?|ftps?|mailto):(\/\/)?(www\.)?/, '');
	}

	var $c = $('<dl>').attr('id', 'relatedlinkslist');
	$('#main a').each(function() {
		$(this).attr('target', "_blank");
		var $dt = $('<dt>');
		var $dd = $('<dd>');
		var href = $(this).attr('href');
		var shortlink = shorten(href);
		var desc = $(this).attr('title');

		$dd.text(desc);
		var $link = $("<a>")
			.attr('href', href)
			.attr('target', "_blank")
			.text(shortlink);
		$dt.prepend($link);
		$c.append($dt, $dd);
	});
	if($c.children().size() > 0) {
		$c.appendTo('#relatedlinks');
	}
})(jQuery);
