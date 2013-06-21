var fs = require('fs');
var path = require('path');

var async = require('async');
var dmp_module = require("diff_match_patch");
var DMP = new dmp_module.diff_match_patch();
var _ = require("underscore");

var utils = require("./utils");


var Listener = function (path, conn) {
  var self = this;

  self.path = path;
  self.conn = conn;
  self.watch(function (err, result) {
    console.log("EVERYTHING IS BEING WATCHED");
    conn.listener_ready(self);
  });
  self.bufs = {};
  self.dirs = {};
  self.watchers = {};
};

Listener.prototype.listener = function (original_path, is_dir, event, filename) {
  var self = this,
    buf,
    patches;

  console.log(event, original_path, is_dir);

  if (is_dir || event === 'rename') {
    return;
  }
  try{
    buf = fs.readFileSync(original_path);
    if (! buf) return;
    console.log(buf.toString(), self.bufs[original_path].toString());
    patches = DMP.patch_make(self.bufs[original_path].toString(), buf.toString());
    console.log(DMP.patch_toText(patches));
  }  catch (e){
    console.error(e);
  }

  // conn.write();
};

Listener.prototype.add_listener = function (f, is_dir, cb) {
  var self = this,
    rel_path = path.relative(self.path, f);

  is_dir = is_dir === true ? true : false;

  if (is_dir){
    fs.watch(f, self.listener.bind(self, f, is_dir));
    self.dirs[rel_path] = true;
    return cb();
  }


  fs.readFile(f, function (err, buf) {
    if (err){
      return cb(err);
    }
    self.bufs[rel_path] = {buf: buf, md5: utils.md5(buf.toString())};
    // not sure possibly 50K closures is a good idea, but it works for HN...
    fs.watch(f, self.listener.bind(self, f, is_dir));
    cb();
  });
};

Listener.prototype.watch = function (cb) {
  var self = this;

  async.auto({
    paths: function (cb) {
      utils.walk_dir(self.path, cb);
    },
    dirs: ['paths', function (cb, res) {
      async.eachLimit(_.values(res.paths.dirs), 20, function (filename, cb) {
        self.add_listener(filename, true, cb);
      }, cb);
    }],
    files: ['paths', function (cb, res) {
      async.eachLimit(_.values(res.paths.files), 20, function (filename, cb) {
        self.add_listener(filename, false, cb);
      }, cb);
    }]
  }, function (err, result) {
    if (err) {
      console.error(err);
      return cb(err, result);
    }
    return cb(err, result);
  });
};

exports.Listener = Listener;