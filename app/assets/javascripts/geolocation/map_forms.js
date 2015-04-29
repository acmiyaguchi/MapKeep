var mapkeep = mapkeep || {};

/**
 * A form helper for form creation and dom manipulation
 * @param app Mapkeep app, map manipulation
 * @param albums For listing in the form
 * @constructor
 */
mapkeep.formHelper = function(app, albums) {
  /** Counter for form identification */
  this.formNum = 0;
  /** All forms created so far */
  this.forms = {};
  /** List of all user's albums */
  this.albums = albums;
  /** Current opened form */
  this.curForm = null;

  /** @type mapkeep.app */
  this.app = app;
};

/**
 * One time set up for form click/keyup functions that never change
 * included cancel, delete, and keyup for title input
 */
mapkeep.formHelper.prototype.init = function() {
  var overlay = $('#overlay');

  // Cancel either removes not/marker or undos changes made
  overlay.on('click', '#cancel-button', function() {
    if (this.curForm.hasClass('new_note')) {
      // Remove note and marker
      overlay.find('form').remove();
      overlay.addClass('hide');
      this.app.curMarker.setMap(null);
      this.app.curWindow.setMap(null);
    } else {
      // Undo changes the user made
      this.makeReadonly();
      var lat = overlay.find('input[name=note\\[latitude\\]]').val();
      var lng = overlay.find('input[name=note\\[longitude\\]]').val();
      this.app.curMarker.setPosition(new google.maps.LatLng(lat, lng));
    }
  }.bind(this));

  // Sync title input with info window title
  overlay.on('change paste keyup', 'input[name=note\\[title\\]]', function() {
    this.app.curWindow.setContent(
      overlay.find('input[name=note\\[title\\]]').val());
  }.bind(this));

  // Change form method to delete before submission (for rails)
  overlay.on('click', '#delete-button', function() {
    overlay.find('input[name=_method]').val('delete');
  });
};

/**
 * Creates a hidden input with corresponding name and value
 * @param name
 * @param value
 * @returns {*|jQuery}
 */
mapkeep.formHelper.prototype.hiddenInput = function(name, value) {
  return $('<input/>')
    .attr('name', name)
    .attr('type', 'hidden')
    .val(value);
};

/**
 * Create album id comma separated string
 * @param albums
 * @returns {string}
 */
mapkeep.formHelper.prototype.albumIdString = function(albums) {
  var albumIds = '';
  for (var i = 0; i < albums.length; i++) {
    albumIds += albums[i].id + ',';
  }
  return albumIds;
};

/**
 * Creates a form for a note that is tied to a marker
 * @param marker The note belongs to for coordinates
 * @param readonly Whether or not this is a new note
 * @param note Note to use title and body for if existing
 * @returns {Number} identifier for form
 */
mapkeep.formHelper.prototype.createNoteForm =
  function(marker, readonly, note) {
    var title = $('<input/>')
      .attr('name', 'note[title]')
      .attr('placeholder', 'Title')
      .attr('value', readonly ? note.title : '')
      .attr('type', 'text');

    var submit = $('<button/>')
      .text(readonly ? 'Edit' : 'Save')
      .addClass('button tiny right')
      .attr('id', 'submit-edit-button')
      .attr('type', 'submit');

    var deleteButton = $('<button/>')
      .text('Delete')
      .addClass('alert tiny right hide')
      .attr('type', 'submit')
      .attr('id', 'delete-button');

    var cancelButton = $('<button/>')
      .text('Cancel')
      .addClass('secondary tiny right hide')
      .attr('type', 'button')
      .attr('id', 'cancel-button');

    var textarea = $('<textarea/>')
      .attr('name', 'note[body]')
      .attr('rows', '10')
      .attr('placeholder', 'Write anything you want about this location!')
      .text(readonly ? note.body : '');

    var form = $('<form/>')
      .addClass(readonly ? '' : 'new_note')
      .attr('id', 'i' + this.formNum)
      .attr('action', readonly ? '/notes/' + note.id : '/notes')
      .attr('method', 'post')
      .attr('data-remote', 'true')
      .attr('accept-charset', 'UTF-8')
      .append(title)
      .append($('<br/>'))
      .append(textarea)
      .append(this.createAlbumHtml(note, readonly))
      .append(this.hiddenInput('note[latitude]', marker.position.lat()))
      .append(this.hiddenInput('note[longitude]', marker.position.lng()))
      .append(this.hiddenInput('authenticity_token', this.authToken))
      .append(this.hiddenInput('form_id', this.formNum))
      .append(this.hiddenInput('note[album_ids][]',
        readonly ? this.albumIdString(note.albums) : ''))
      .append(submit)
      .append(deleteButton)
      .append(cancelButton);

    if (readonly) {
      textarea.attr('readonly', 'readonly');
      title.attr('readonly', 'readonly');
      form.append(this.hiddenInput('_method', 'patch'));
    }

    // Save marker and form for deletion / manipulation
    this.app.markers[this.formNum] = marker;
    this.forms[this.formNum] = form;

    this.app.addMarkerListener(this.formNum);
    return this.formNum++;
  };

/**
 * Makes the current form readonly
 */
mapkeep.formHelper.prototype.makeReadonly = function() {
  this.app.curMarker.setOptions({
    draggable: false
  });

  this.resetForm();

  // Make fields readonly
  this.curForm.find('input[name=note\\[title\\]], textarea')
    .attr('readonly', 'readonly');

  // Prevent submit and change button text to 'Edit'
  this.turnOffSubmit();
  $('#submit-edit-button').text('Edit');

  // Hide delete and dropdown button
  $('#delete-button, #album-button, #cancel-button')
    .addClass('hide')
    .removeClass('button');

  // Hide album delete labels
  this.curForm.find('span.alert')
    .addClass('hide')
    .removeClass('label');
};

/**
 * Makes current form editable and marker draggable
 */
mapkeep.formHelper.prototype.makeEditable = function() {
  this.app.curMarker.setOptions({
    draggable: true
  });

  // Make fields editable
  this.curForm.find('input[name=note\\[title\\]], textarea')
    .removeAttr('readonly');

  // Remove submit blocking, change text to 'Save'
  this.turnOnSubmit();
  $('#submit-edit-button').text('Save');

  // Show delete and dropdown button
  $('#delete-button, #cancel-button, #album-button')
    .removeClass('hide')
    .addClass('button');

  // Show album delete labels
  this.curForm.find('span.alert')
    .removeClass('hide')
    .addClass('label');

  // Focus on input
  this.curForm.find('input[name=note\\[title\\]]').focus();
};

/**
 * Creates checkboxes for present labels, or empty input if none
 * for form submission
 * @returns {Array}
 */
mapkeep.formHelper.prototype.createAlbumCheckboxes = function() {
  var elements = [];
  var empty = true;
  for (var i = 0; i < this.albums.length; i++) {
    var id = this.albums[i].id;
    var album = this.curForm.find('.group[value=' + id + ']').not('.hide');
    if (album.length > 0) {
      empty = false;
      elements.push(
        this.hiddenInput('note[album_ids][]', id)
          .attr('type', 'checkbox')
          .addClass('hide')
          .prop('checked', album.length > 0));
    }
  }

  if (empty) {
    elements.push(this.hiddenInput('note[album_ids][]', ''));
  }

  return elements;
};

/**
 * Update album ids input before save
 * Make current for submittable
 */
mapkeep.formHelper.prototype.turnOnSubmit = function() {
  $('#overlay')
    .off('click', '#submit-edit-button')
    .on('click', '#submit-edit-button', function() {

      // Update album ids input(s)
      $('#overlay').find('input[name=note\\[album_ids\\]\\[\\]]').remove();
      this.curForm.append.apply(this.curForm, this.createAlbumCheckboxes());

      // Update lat/lng with marker coordinates
      this.curForm.find('input[name=note\\[latitude\\]]')
        .val(this.app.curMarker.position.lat());
      this.curForm.find('input[name=note\\[longitude\\]]')
        .val(this.app.curMarker.position.lng());
    }.bind(this));
};

/**
 * Make current form editable on click
 */
mapkeep.formHelper.prototype.turnOffSubmit = function() {
  $('#overlay')
    .off('click', '#submit-edit-button')
    .on('click', '#submit-edit-button', function() {
      this.makeEditable();
      return false;
    }.bind(this));
};

/**
 * Resets form including inputs, textarea, album labels
 */
mapkeep.formHelper.prototype.resetForm = function() {
  // Reset normal inputs
  this.curForm.get(0).reset();

  // Set info window title to default value
  if (this.app.curWindow) {
    this.app.curWindow.setContent(
      this.curForm.find('input[name=note\\[title\\]]').val());
  }

  // Reset album labels
  this.removeAlbumLabels();
};

/**
 * Close last form and open new one as well as info window with title
 * @param formNum Form identifier
 * @param timeout For info window open
 */
mapkeep.formHelper.prototype.showForm = function(formNum, timeout) {
  var overlay = $('#overlay');
  this.curForm = this.forms[formNum];

  // Open info window for note title at corresponding marker after timeout
  setTimeout(function() {
    this.app.openInfoWindow(
      this.curForm.find('input[name=note\\[title\\]]').val(),
      this.app.markers[formNum]
    );
  }.bind(this), timeout);

  // Remove previous form and show specified form
  overlay.find('form').remove();
  overlay.append(this.curForm).removeClass('hide');

  if (!this.curForm.hasClass('new_note')) {
    // Force form to be readonly if not a new note
    this.makeReadonly();
  } else {
    // Hide delete button if it is a new note
    this.makeEditable();
    this.curForm.find('#delete-button').addClass('hide').removeClass('button');
  }

  // Initialize foundation components
  $(document).foundation();
};

/**
 * On click function for album dropdown click
 * @param album
 * @returns {Function}
 */
mapkeep.formHelper.prototype.albumPrepend = function(album) {
  return function() {
    var label = this.curForm.find('span[value=' + album.id + ']');
    if (!label.length) {
      // Append label if it doesn't exist and is not hidden
      $('#album-button').before(this.makeLabelGroup(album, true));
    } else {
      // Otherwise just unhide the label
      label.parent().removeClass('hide');
    }
  }.bind(this);
};

/**
 * Creates html for album label creation and deletion
 * and displays albums the note belongs to
 * @param note
 * @param readonly
 * @returns {*|jQuery}
 */
mapkeep.formHelper.prototype.createAlbumHtml = function(note, readonly) {
  var albumHtml = $('<div/>');

  // Add label groups for albums the note belongs in currently
  if (note && note.albums.length > 0) {
    for (var i = 0; i < note.albums.length; i++) {
      var album = note.albums[i];
      albumHtml.append(this.makeLabelGroup(album));
    }
  }

  // Create dropdown button and list
  var clz = readonly ? 'hide' : 'button';
  var dropDownButton = $('<button/>')
    .addClass('secondary tiny dropdown ' + clz)
    .attr('id', 'album-button')
    .attr('data-dropdown', 'album-dropdown')
    .attr('aria-controls', 'album-dropdown')
    .attr('aria-expanded', 'false')
    .attr('type', 'button')
    .attr('href', '#')
    .html('+ Album');
  albumHtml.append(dropDownButton);
  albumHtml.append(this.createAlbumDropDown());

  return albumHtml;
};

/**
 * Creates dropdown of all the user's current albums
 * @returns {*|jQuery}
 */
mapkeep.formHelper.prototype.createAlbumDropDown = function() {
  var dropDown = ($('<ul data-dropdown-content/>')
    .addClass('f-dropdown')
    .attr('id', 'album-dropdown')
    .attr('aria-hidden', 'true'));

  // Add links that represent the user's albums, on click it adds a label group
  for (var i = 0; i < this.albums.length; i++) {
    var album = this.albums[i];
    var link = $('<a/>')
      .attr('href', '#')
      .html(album.title)
      .click(this.albumPrepend(album));
    dropDown.append($('<li/>').append(link));
  }

  return dropDown;
};

/**
 * Removes any album labels not in albumIds input
 * which correspond to labels added but not *saved*
 */
mapkeep.formHelper.prototype.removeAlbumLabels = function() {
  this.curForm.find('.group').removeClass('hide');

  var albumIds = this.curForm.find(
    'input[name=note\\[album_ids\\]\\[\\]]').val().split(',');
  var albumLabels = this.curForm.find('.group');
  for (var i = 0; i < albumLabels.length; i++) {
    if (albumIds.indexOf($(albumLabels[i]).attr('value')) < 0) {
      $(albumLabels[i]).remove();
    }
  }
};

/**
 * Creates a label group:
 *    - the album name label (tagged with album id as value)
 *    - a delete X alert label
 * @param album For title and id
 * @param showDelete Whether or not to show the delete button
 * @returns {*|jQuery}
 */
mapkeep.formHelper.prototype.makeLabelGroup = function(album, showDelete) {
  var label = $('<span/>')
    .addClass('label')
    .html(album.title);

  // Hide label on delete, remove on save
  var deleteLabel = $('<span/>').addClass('alert').html('X');
  $('#overlay').on('click', 'span.alert', function() {
    $(this).parent().addClass('hide');
  });

  // Show delete button next to label or not
  if (showDelete) {
    deleteLabel.addClass('label');
  } else {
    deleteLabel.addClass('hide');
  }

  return $('<span/>')
    .addClass('group')
    .append(label)
    .append(deleteLabel)
    .attr('value', album.id);
};


/**
 * Callback for note creation (switch to update);
 * @param formNum
 * @param note
 */
mapkeep.formHelper.prototype.formSubmitted = function(formNum, note) {
  var form = this.forms[formNum];

  // Add method and change action so future submits are updated
  form.append('<input type="hidden" name="_method" value="patch">');
  form.attr('action', '/notes/' + note.id);
  form.removeClass('new_note');

  this.resetDefaultValues(note, form);
  this.makeReadonly();
};

/**
 * Callback for form updates
 * @param formNum
 * @param note
 */
mapkeep.formHelper.prototype.formUpdated = function(formNum, note) {
  this.resetDefaultValues(note, this.forms[formNum]);
  this.makeReadonly();
};

/**
 * Resets default values of inputs to fresh values from note
 * @param note
 * @param form
 */
mapkeep.formHelper.prototype.resetDefaultValues = function(note, form) {
  form.find('input[name=note\\[title\\]]').prop('defaultValue', note.title);
  form.find('textarea').prop('defaultValue', note.body);
  form.find('input[name=latitude]').prop('defaultValue', '' + note.latitude);
  form.find('input[name=latitude]').prop('defaultValue', '' + note.latitude);
  form.find('input[name=note\\[album_ids\\]\\[\\]]').remove();
  form.append(this.hiddenInput(
    'note[album_ids][]', this.albumIdString(note.albums)));
};

