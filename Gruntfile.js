var fs = require('fs');
var glob = require('glob');
var exec = require('child_process').exec;
var sys = require('sys');
var colors = require('colors');
var execSync = require('execSync');
var uglifyjs = require('uglify-js');
var cleanCss = require('clean-css');
var mkdirp = require('mkdirp');
var path = require('path');
var rimraf = require('rimraf');
var crypto = require('crypto');
var xRegExp = require('xregexp').XRegExp;
var _ = require('lodash');

var rmDirSync = function(dirPath) {
  try { var files = fs.readdirSync(dirPath); }
  catch(e) { return; }
  if (files.length > 0)
    for (var i = 0; i < files.length; i++) {
      var filePath = dirPath + '/' + files[i];
      if (fs.statSync(filePath).isFile())
        fs.unlinkSync(filePath);
      else
        rmDirSync(filePath);
    }
  fs.rmdirSync(dirPath);
};

module.exports = function(grunt) {
  // Project configuration.
  grunt.initConfig({
    build: {
      path: 'web',
      buildFileName: 'index.html',
      sourceFileName: 'index-dev.html'
    },
    watch: {
      sass: {
        files: [
          'assets/styles/**/*.scss'
        ],
        tasks: ['sass'],
        options: {
          nospawn: true
        }
      }
    },
    /*typeScript: {
     files: ['*.ts']
     },*/
    sass: {
      dist: {
        files: {
          'assets/styles/main.css': [
            'assets/styles/main.scss'
          ]
        }
      }
    }
  });

  //load grunt plugins
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-sass');

  //this task will include everything in to to generate the final production version of the code
  grunt.registerTask('dist', ['sass', 'build']);

  //custom tasks
  grunt.registerTask('build', 'Builds a production version of your application', function() {
    //when deleting build files, lets not delete these
    var dontDeleteFiles = ['.svn', '.git', '.gitignore', '.gitkeep'];

    //we need to keep tracking of some meta data about the build files to be able to deteremine if we need to generate them
    var buildMetaDataFilePath = __dirname + '/build-meta-data.json';
    var currentBuildMetaData = {};
    var lastBuildMetaData = {};

    if(fs.existsSync(buildMetaDataFilePath)) {
      lastBuildMetaData = JSON.parse(fs.readFileSync(buildMetaDataFilePath, 'ascii'))
    }

    if(!currentBuildMetaData['workingFiles']) {
      currentBuildMetaData['workingFiles'] = {};
    }

    if(!lastBuildMetaData['workingFiles']) {
      lastBuildMetaData['workingFiles'] = {};
    }

    //lets cache all the files that have changed upfront
    var changedFiles = {};
    var changedFilesKeys = [];

    for(var resourcePath in lastBuildMetaData['workingFiles']) {
      if(
      lastBuildMetaData['workingFiles'][resourcePath]
      && getFileHash(resourcePath) !== lastBuildMetaData['workingFiles'][resourcePath].fileHash
      ) {
        changedFiles[resourcePath] = lastBuildMetaData['workingFiles'][resourcePath].compiledFilePath;
      }
    }

    changedFilesKeys = Object.keys(changedFiles);

    /**
     * Tells whether or not the any of the files in the list has a changed one
     *
     * @param files
     * @returns {*}
     */
    function hasChangedFile(files) {
      for(var file in files) {
        if(changedFilesKeys.indexOf(path.relative(__dirname, files[file])) !== -1) {
          return true;
        }
      }

      return false;
    }

    /**
     * Determines if the passed in files list is the same list of files used the last time the compiled files was generated
     *
     * @param originalFileName
     * @param files
     * @returns {boolean}
     */
    function hasSameFiles(originalFileName, files) {
      if(!lastBuildMetaData['buildFiles'] || !lastBuildMetaData['buildFiles'][originalFileName]) {
        return false;
      }

      for(var file in files) {
        if(lastBuildMetaData['buildFiles'][originalFileName].indexOf(path.relative(__dirname, files[file])) === -1) {
          return false
        }
      }

      return files.length === lastBuildMetaData['buildFiles'][originalFileName].length;


    }

    /**
     * Returns all the compiled files that used the files of files during the last build
     *
     * @param files
     * @returns {Array}
     */
    function getCompiledFiles(files) {
      var filePaths = [];

      for(file in files) {
        if(
        filePaths.indexOf(lastBuildMetaData['workingFiles'][path.relative(__dirname, files[file])]) === -1
        && lastBuildMetaData['workingFiles'][path.relative(__dirname, files[file])]
        ) {
          filePaths.push(lastBuildMetaData['workingFiles'][path.relative(__dirname, files[file])].compiledFilePath);
        }
      }

      return filePaths;
    }

    /**
     * Generates a sha1 hash of the contents of a files
     *
     * @param filePath
     * @returns {*}
     */
    function getFileHash(filePath) {
      var shasum = crypto.createHash('sha1');
      return shasum.update(fs.readFileSync(filePath, 'ascii')).digest('hex');
    }

    /**
     * Adds meta data information for the build
     *
     * @param filePath
     * @param compiledFilePath
     * @param originalFileName
     */
    function addBuildMetaDataFile(filePath, compiledFilePath, originalFileName) {
      filePath = path.relative(__dirname, filePath);

      currentBuildMetaData['workingFiles'][filePath] = {
        //a hash of the file is probably a more accurate way of determine if the file has changed than last modified datetime
        fileHash: getFileHash(filePath),
        compiledFilePath: path.relative(__dirname, compiledFilePath)
      };

      if(!currentBuildMetaData['buildFiles']) {
        currentBuildMetaData['buildFiles'] = {};
      }

      if(!currentBuildMetaData['buildFiles'][originalFileName]) {
        currentBuildMetaData['buildFiles'][originalFileName] = [];

        if(lastBuildMetaData['buildFiles']) {
          lastBuildMetaData['buildFiles'][originalFileName] = [];
        }
      }

      currentBuildMetaData['buildFiles'][originalFileName].push(filePath);
    }

    function buildCssFiles(files, destinationFile) {
      function buildCompiledFile(files, destinationFile, originalFileName) {
        if(
        (!currentBuildMetaData['workingFiles'] || Object.keys(currentBuildMetaData['workingFiles']).length === 0)
        && (!lastBuildMetaData['workingFiles'] || Object.keys(lastBuildMetaData['workingFiles']).length === 0)
        && fs.existsSync(path.dirname(destinationFile))
        ) {
          var items = fs.readdirSync(path.dirname(destinationFile));

          for(var z = 0; z < items.length; z += 1) {
            if(dontDeleteFiles.indexOf(items[z]) === -1) {
              console.log(('removing file ' + path.dirname(destinationFile) + '/' + items[z]).yellow);
              rimraf.sync(path.dirname(destinationFile) + '/' + items[z]);
            }
          }
        }

        if(!fs.existsSync(path.dirname(destinationFile))) {
          mkdirp.sync(path.dirname(destinationFile));
        }

        files.forEach(function(filePath){
          addBuildMetaDataFile(filePath, destinationFile, originalFileName);
          console.log(('adding ' + filePath + ' to ' + destinationFile).green);
          source = fs.readFileSync(filePath, 'ascii');
          minSource = cleanCss.process(source);

          fs.appendFileSync(destinationFile, minSource, 'ascii');
        });
      };

      var shasum = crypto.createHash('sha1');
      var fileHashPrefix = shasum.update(new Date().getTime() + destinationFile).digest('hex');
      var source, minSource;
      var originalFileName = path.basename(destinationFile);

      //we want to add in a hash to the destination file name in order to make sure the browser redownloads the files on next update
      destinationFile = path.dirname(destinationFile) + '/' + fileHashPrefix + '-' + path.basename(destinationFile);

      var changedFile = hasChangedFile(files);
      var sameFiles = hasSameFiles(originalFileName, files);
      var compiledFiles = getCompiledFiles(files);

      if(changedFile || !sameFiles) {
        for(compiledFile in compiledFiles) {
          if(fs.existsSync(compiledFiles[compiledFile])) {
            console.log(('removing file ' + compiledFiles[compiledFile]).yellow);
            rimraf.sync(compiledFiles[compiledFile]);
          }
        }

        buildCompiledFile(files, destinationFile, originalFileName);
      } else if(!changedFile && sameFiles && !fs.existsSync(compiledFiles[0])) {
        buildCompiledFile(files, destinationFile, originalFileName);
      } else {
        destinationFile = compiledFiles[0];
      }

      return destinationFile;
    };

    function buildJavascriptFiles(files, destinationFile) {
      function buildCompiledFile(files, destinationFile, originalFileName) {
        if(
        (!currentBuildMetaData['workingFiles'] || Object.keys(currentBuildMetaData['workingFiles']).length === 0)
        && (!lastBuildMetaData['workingFiles'] || Object.keys(lastBuildMetaData['workingFiles']).length === 0)
        && fs.existsSync(path.dirname(destinationFile))
        ) {
          var items = fs.readdirSync(path.dirname(destinationFile));

          for(var z = 0; z < items.length; z += 1) {
            if(dontDeleteFiles.indexOf(items[z]) === -1) {
              console.log(('removing file ' + path.dirname(destinationFile) + '/' + items[z]).yellow);
              rimraf.sync(path.dirname(destinationFile) + '/' + items[z]);
            }
          }
        }

        files.forEach(function(filePath){
          addBuildMetaDataFile(filePath, destinationFile, originalFileName);
          console.log(('adding ' + filePath + ' to ' + destinationFile).green);
          source = fs.readFileSync(filePath, 'ascii');

          //lets just use the simple version for now
          //todo: think: look into more advance options at some point
          var minSource = uglifyjs.minify(source, {fromString: true});

          fs.appendFileSync(destinationFile, minSource.code, 'ascii');
        });
      };

      var shasum = crypto.createHash('sha1');
      var fileHashPrefix = shasum.update(new Date().getTime() + destinationFile).digest('hex');
      var parser = uglifyjs.parser;
      var uglify = uglifyjs.uglify;
      var source, minSource;
      var originalFileName = path.basename(destinationFile);

      //we want to add in a hash to the destination file name in order to make sure the browser redownloads the files on next update
      destinationFile = path.dirname(destinationFile) + '/' + fileHashPrefix + '-' + path.basename(destinationFile);
      var changedFile = hasChangedFile(files);
      var sameFiles = hasSameFiles(originalFileName, files);
      var compiledFiles = getCompiledFiles(files);

      if(changedFile || !sameFiles) {
        for(compiledFile in compiledFiles) {
          if(fs.existsSync(compiledFiles[compiledFile])) {
            console.log(('removing file ' + compiledFiles[compiledFile]).yellow);
            rimraf.sync(compiledFiles[compiledFile]);
          }
        }

        buildCompiledFile(files, destinationFile, originalFileName);
      } else if(!changedFile && sameFiles && !fs.existsSync(compiledFiles[0])) {
        buildCompiledFile(files, destinationFile, originalFileName);
      } else {
        destinationFile = compiledFiles[0];
      }

      return destinationFile;
    };

    function parseForBuildComments(htmlParserHandler) {
      var cssFiles = Object.create(null);
      var javascriptFiles = Object.create(null);
      var stack = htmlParserHandler.dom;
      var tracking = false;
      var trackingType = null;
      var currentFile = null;
      var temp = null;

      function traverse(element) {
        if(element.type === 'comment' || (tracking === true && (element.type === 'tag' || element.type === 'script'))) {
          if(element.type === 'comment') {
            if(element.raw.indexOf('START-CSS-MIN') !== -1) {
              temp = element.raw.split(':')[1].trim();

              if(temp.slice(0, 1) !== '/'){
                temp = '/' + temp;
              }

              currentFile = __dirname + '/' + applicationPath + temp;

              if(cssFiles[currentFile] === undefined) {
                cssFiles[currentFile] = [];
              }

              tracking = true;
              trackingType = 'css';
            } else if(element.raw.indexOf('START-JS-MIN') !== -1) {
              temp = element.raw.split(':')[1].trim();

              if(temp.slice(0, 1) !== '/'){
                temp = '/' + temp;
              }

              currentFile = __dirname + '/' + applicationPath + temp;

              if(javascriptFiles[currentFile] === undefined) {
                javascriptFiles[currentFile] = [];
              }

              tracking = true;
              trackingType = 'js';
            } else if(element.raw.indexOf('END-CSS-MIN') !== -1) {
              tracking = false;
              trackingType = null;
            } else if(element.raw.indexOf('END-JS-MIN') !== -1) {
              tracking = false;
              trackingType = null;
            }
          } else {
            if(tracking === true) {
              if(trackingType === 'css') {
                if(element.attribs.href.slice(0, 1) !== '/'){
                  element.attribs.href = '/' + element.attribs.href;
                }
                cssFiles[currentFile].push(__dirname + '/' + applicationPath + element.attribs.href);
              } else {
                if(element.attribs.src.slice(0, 1) !== '/'){
                  element.attribs.src = '/' + element.attribs.src;
                }
                javascriptFiles[currentFile].push(__dirname + '/' + applicationPath +  element.attribs.src);
              }
            }
          }
        }

        if (element.children) {
          element.children.forEach(traverse);
        }
      };

      stack.forEach(traverse);

      return {
        cssFiles: cssFiles,
        javascriptFiles: javascriptFiles
      }
    };

    var applicationPath = grunt.config.get('build').path;
    var applicationAbsolutePath = __dirname + '/' + applicationPath;
    var buildIndexFilePath = applicationAbsolutePath + '/' + grunt.config.get('build').buildFileName;
    var sourceIndexFilePath = applicationAbsolutePath + '/' + grunt.config.get('build').sourceFileName;
    var htmlparser = require("htmlparser");
    var rawHtml = fs.readFileSync(sourceIndexFilePath, 'ascii');


    var handler = new htmlparser.DefaultHandler(function (error, dom) {
      if (error) {
        console.log(error.red);
      }
    });
    var parser = new htmlparser.Parser(handler);
    parser.parseComplete(rawHtml);
    filesToBuild = parseForBuildComments(handler);

    for(var desinationFile in filesToBuild.cssFiles) {
      var regexp = xRegExp('<!-- START-CSS-MIN:' + desinationFile.replace(applicationAbsolutePath, '') + ' -->(.*?)<!-- END-CSS-MIN -->', 's');
      var text = xRegExp.exec(rawHtml, regexp)[0];
      var newFileName = buildCssFiles(filesToBuild.cssFiles[desinationFile], desinationFile);
      rawHtml = rawHtml.replace(text, '<link type="text/css" rel="stylesheet" href=".' + newFileName.replace(applicationAbsolutePath, '') + '">');
    }

    for(var desinationFile in filesToBuild.javascriptFiles) {
      var regexp = xRegExp('<!-- START-JS-MIN:' + desinationFile.replace(applicationAbsolutePath, '') + ' -->(.*?)<!-- END-JS-MIN -->', 's');
      var text = xRegExp.exec(rawHtml, regexp)[0];
      var newFileName = buildJavascriptFiles(filesToBuild.javascriptFiles[desinationFile], desinationFile);
      rawHtml = rawHtml.replace(text, '<script type="text/javascript" src=".' + newFileName.replace(applicationAbsolutePath, '') + '"></script>');
    }

    console.log(('writing out ' + buildIndexFilePath + ' file').green);
    fs.writeFileSync(buildIndexFilePath, rawHtml, 'ascii');

    //if we have gotten here then it is safe to write the new build meta data file
    currentBuildMetaData = _.merge(lastBuildMetaData, currentBuildMetaData);
    console.log(('writing out build meta data file ' + buildMetaDataFilePath).green);
    fs.writeFileSync(buildMetaDataFilePath, JSON.stringify(currentBuildMetaData, null, 2), 'ascii');
  });

  grunt.registerTask('ts', 'Compile TypeScript files to JavaScript (also works with watch)', function() {
    //get a list of files that we need to compile, if not using watch, compile all files
    var changedTypeScriptFiles, deletedTypeScriptFiles;
    changedTypeScriptFiles = [];
    deletedTypeScriptFiles = [];

    function getJavaScriptFileName(typeScriptFileName){
      return typeScriptFileName.slice(0, -3) + '.js'
    };

    if(grunt.file.watchFiles) {
      if(grunt.file.watchFiles.changed === null){
        grunt.config.get('typeScript').files.forEach(function(globSelector){
          var files = glob.sync(globSelector);
          files.forEach(function(filePath){
            changedTypeScriptFiles[changedTypeScriptFiles.length] = filePath
          });
        });
      } else {
        changedTypeScriptFiles = grunt.file.watchFiles.changed;
      }

      if(grunt.file.watchFiles.deleted !== null){
        deletedTypeScriptFiles = grunt.file.watchFiles.deleted;
      }
    }

    if(deletedTypeScriptFiles) {
      deletedTypeScriptFiles.forEach(function(filePath){
        console.log(('deleted: ' + getJavaScriptFileName(filePath)).yellow);
        fs.unlink(getJavaScriptFileName(filePath));
      });
    }

    changedTypeScriptFiles.forEach(function(filePath){
      //do not compile defination files
      if(filePath.slice(-5) === '.d.ts'){
        return;
      }

      console.log(('deleted: ' + getJavaScriptFileName(filePath)).yellow);
      fs.unlink(getJavaScriptFileName(filePath));

      var cmd = 'tsc -c ' + filePath;

      console.log(('compiling: ' + filePath).green);

      var commandResults = execSync.exec(cmd);
      console.log(commandResults.stdout);
    });
  });
};