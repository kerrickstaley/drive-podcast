var OUTPUT_FILE_NAME = 'podcast_feed_file.xml'

/**
 * Check whether folder contains files larger than 25 MB.
 *
 * Such files cannot be scanned by Drive's antivirus scanner [1]. When the user tries to download
 * such a file via an "ANYONE_WITH_LINK" URL, they are redirected to a warning page saying the file
 * could not be scanned. This warning page prevents podcast clients from automatically downloading
 * the file. The fix is to use "public hosting" [2], which does not have this behavior.
 *
 * [1] https://support.google.com/a/answer/172541?hl=en
 * [2] https://support.google.com/drive/answer/2881970?hl=en
 */
function doCheckForLargeFiles(id) {
  var files = getAudioVideoFiles(DriveApp.getFolderById(id));
  return files.some(function(file) {
    return file.getSize() > 25 << 20;
  });
}
  
/**
 * Determine whether a given file is audio/video or not.
 */
function isAudioVideoFile(file) {
  var topLevelMimeType = file.getMimeType().split('/')[0];
  return topLevelMimeType == 'audio' || topLevelMimeType == 'video';
}

/**
 * Compare strings (just like cstdlib's strcmp).
 */
function strcmp(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * Get all audio/video files in a folder, sorted by name.
 */
function getAudioVideoFiles(folder) {
  var rv = [];
  var contents = folder.getFiles();
  while (contents.hasNext()) {
    var file = contents.next();
    if (isAudioVideoFile(file)) {
      rv.push(file);
    }
  }
  rv.sort(function(fileA, fileB) {
    return strcmp(fileA.getName(), fileB.getName());
  });
  return rv;
}

/**
 * Get bogus date based on index.
 *
 * We use this to generate increasing timestamps for files, so that they will be sorted correctly.
 *
 * @return A string, representing a date |idx| hours after the epoch, in a format suitable for a
 * podcast file.
 */
function indexToFakeDate(idx) {
  return Utilities.formatDate(new Date(idx * 3600e3), 'GMT', "E, d MMM yyyy HH:mm:ss 'GMT'");
}

/**
 * Write output to output file.
 *
 * If there is a single file in the folder with OUTPUT_FILE_NAME, it is overwritten, otherwise a new
 * file is created.
 *
 * Unfortunately, when overwriting an existing file, the shared link isn't preserved; only the
 * public link is preserved during updates.
 */
function writeOutput(folder, output) {
  var existingOutFiles = folder.getFilesByName(OUTPUT_FILE_NAME);
  var existingOutFilesArr = [];
  while (existingOutFiles.hasNext()) {
    existingOutFilesArr.push(existingOutFiles.next());
  }
  if (existingOutFilesArr.length == 1) {
    existingOutFilesArr[0].setContent(output);
    return existingOutFilesArr[0];
  } else {
    var outFile = DriveApp.createFile(OUTPUT_FILE_NAME, output);
    folder.addFile(outFile);
    DriveApp.getRootFolder().removeFile(outFile);
    return outFile;
  }
}
  
/**
 * Converts the URL returned by file.getUrl() to a direct link.
 *
 * As an example, the URL
 *   https://docs.google.com/a/kerrickstaley.com/file/d/FILE_ID/edit?usp=drivesdk
 * will be converted to
 *   https://docs.google.com/a/kerrickstaley.com/uc?id=FILE_ID
 */
function getSharedUrl(file) {
  return file.getUrl()
    .replace('/file/d/', '/uc?id=')
    .replace('/edit?usp=drivesdk', '')
    .replace('/view?usp=drivesdk', '');
}

/**
 * Get the public URL [1] of |file| in |folder|.
 *
 * [1] https://support.google.com/drive/answer/2881970?hl=en
 */
function getPublicUrl(folder, file) {
  // TODO: escape this
  return 'https://host.googledrive.com/host/' + folder.getId() + '/' + file.getName();
}

/**
 * Scan a folder for audio/video files and create a podcast feed file.
 */
function doFolder(id, sharePublically) {
  var itunesNs = XmlService.getNamespace('itunes', 'http://www.itunes.com/dtds/podcast-1.0.dtd')
  var folder = DriveApp.getFolderById(id);
  var channel = XmlService.createElement('channel');
  var title = XmlService.createElement('title').setText(folder.getName());
  channel.addContent(title);
  // TODO: remove
  var subTitle = XmlService.createElement('subtitle', itunesNs)
    .setText('Generated by drive-podcast');
  channel.addContent(subTitle);
  
  var files = getAudioVideoFiles(folder);
  
  files.forEach(function(file, idx) {
    var item = XmlService.createElement('item');
    var title = XmlService.createElement('title').setText(file.getName().replace(/\..*?$/, ''));
    item.addContent(title);
    var pubDate = XmlService.createElement('pubDate').setText(indexToFakeDate(idx));
    item.addContent(pubDate);
    var enclosure = XmlService.createElement('enclosure');
    var url = sharePublically ? getPublicUrl(folder, file) : getSharedUrl(file);
    enclosure.setAttribute('url', url);
    enclosure.setAttribute('length', file.getSize());
    enclosure.setAttribute('type', file.getMimeType());
    item.addContent(enclosure);
    channel.addContent(item);
  });
  
  var rss = XmlService.createElement('rss').setAttribute('version', '2.0');
  rss.addContent(channel);
  var outText = XmlService.getPrettyFormat().format(XmlService.createDocument(rss));
  
  var trashFiles = folder.getFilesByName(OUTPUT_FILE_NAME);
  while (trashFiles.hasNext()) {
    trashFiles.next().setTrashed(true);
  }
 
  var outFile = writeOutput(folder, outText);
  
  // set sharing permissions
  // TODO: do something smarter based on the folder's current permissions
  if (sharePublically) {
    folder.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
  } else {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
    
  return sharePublically ? getPublicUrl(folder, outFile) : getSharedUrl(outFile);
}

/**
 * Helper that serves HTML.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index.html');
}

/**
 * Helper that returns an OAuth token.
 */
function getOAuthToken() {
  return ScriptApp.getOAuthToken();
}
