#!/usr/local/bin/node

var should = require('should')
    , mongoose = require('mongoose')
    , start = require('../node_modules/mongoose/test/common.js')
    , Schema = mongoose.Schema
    , Table = require('cli-table')
    , ObjectId = Schema.ObjectId
    , flatMatcher = require('../flatmatcher.js').plugin
    // Modeled after tests in Mongoose
    , startTime = Date.now()
    , testCount = 0;

// Setup Schemas for testing. These are identical to those used by Mongoose tests
var Comments = new Schema();

Comments.add({
    title     : String
  , date      : Date
  , body      : String
  , comments  : [Comments]
});

var BlogPost = new Schema({
    title     : String
  , author    : String
  , slug      : String
  , date      : Date
  , meta      : {
        date      : Date
      , visitors  : Number
    }
  , published : Boolean
  , mixed     : {}
  , numbers   : [Number]
  , owners    : [ObjectId]
  , comments  : [Comments]
});

BlogPost.virtual('titleWithAuthor')
  .get(function () {
    return this.get('title') + ' by ' + this.get('author');
  })
  .set(function (val) {
    var split = val.split(' by ');
    this.set('title', split[0]);
    this.set('author', split[1]);
  });

mongoose.model('BlogPost', BlogPost);

// Use of should for testing, style of tests modeled directly after Mongoose tests
// Note however that because there are just a few tests and not a great reason to add dependencies for this simple plugin
//  these tests simply call themselves when the module is run.  At time of this writing, Mongoose uses expresso to run its tests.
module.exports = {
  
  'schema.getMatchObj() should return correct MongodDB matcher object with dot notation and use it to retrieve data': (function () {        
    var collection = 'flatmatcher_1'
      , db = start()
      , BlogPostModel = db.model('BlogPost', collection);

		// Matches attributes with simple types at root level and nested attributes
		var testTitle = 'Dot Notation Test';		
    var matchArgs = {title : testTitle, published : true, visitors : 5};    
    var expectedMatchObj = {title: testTitle, published: true, 'meta.visitors': 5};  
    // Now actually insert some data and retrieve it with find() using the matcher    
    var post = new BlogPostModel({
      title: testTitle,
      published : true
    });
    
    // Use Mongoose #plugin() to decorate Schema with getMatchObj() function
    var matchObj = null;
    var opts = {};
    BlogPost.plugin(flatMatcher, opts);
    // Call matcher to transform matchArgs JSON to flattened predicate
    matchObj = BlogPost.getMatchObj(matchArgs);    
    // Test that we get the expected matcher JSON object for the flat matchArgs
    // matchArgs cover literal types at root level, nested object and embedded array
    expectedMatchObj.should.eql(matchObj);
    
    post.save( function (err) {
      should.strictEqual(null, err);
      post.set('meta.visitors', 5);
      post.save( function (err) {
        should.strictEqual(null, err);
        // Use the matcher generated from flat args here to match nested obj, embedded array        
        BlogPostModel.find(matchObj, function (err, found) {
          should.strictEqual(null, err);          
          found = found[0];     
          // Test the values of the document returned, matching literals a base level
          //  and also nested object and embedded array values
          found.get('title').valueOf().should.equal(testTitle);
          found.get('published').valueOf().should.equal(true);
          found.get('meta.visitors').valueOf().should.equal(5);
          
          testCount += 1; 
          db.close();
        });
      });
    });    
  }()),
  
  'schema.getMatchObj() should return correct MongodDB matcher object with dot notation for matching single simple values in embedded arrays and use it to retrieve data': (function () {
    var collection = 'flatmatcher_2'
      , db = start()
      , BlogPostModel = db.model('BlogPost', collection);
  
    var testTitle = 'Dot Notation Simple Embedded Array Test';
    var matchArgs = {title : testTitle, numbers : 4};    
    // Numbers is array type, at root level, passed one value, so dot notation path for matching one value is simply the property name  
    var expectedMatchObj = {title: testTitle, numbers : 4};    
    var post = new BlogPostModel({
      title: testTitle,
      numbers : [4]
    });

    var matchObj = null;
    var opts = {};    
    BlogPost.plugin(flatMatcher, opts);
    matchObj = BlogPost.getMatchObj(matchArgs);    
    expectedMatchObj.should.eql(matchObj);
        
    post.save( function (err) {
      should.strictEqual(null, err);
      BlogPostModel.find(matchObj, function (err, found) {
        should.strictEqual(null, err);          
        found = found[0];     
        found.get('title').valueOf().should.equal(testTitle);
        found.get('numbers').should.have.length(1);
        found.get('numbers')[0].should.equal(4);
        
        testCount += 1;
        db.close();       
      });
    });    
  }()),
 
  'schema.getMatchObj() should return correct MongodDB matcher object with $in notation for matching multiple simple values in embedded arrays and use it to retrieve data': (function () {
    var collection = 'flatmatcher_3'
      , db = start()
      , BlogPostModel = db.model('BlogPost', collection);
  
    var testTitle = 'Dot Notation MutliValue Embedded Array Test';
    var matchArgs = {title : testTitle, numbers : [4, 5]};    
    // Numbers is array type, at root level, passed multiple values, so $in notation for matching 
    var expectedMatchObj = {title: testTitle, numbers : {'$in' : [4, 5]}};    
    var post = new BlogPostModel({
      title: testTitle,
      numbers : [4, 5, 6]
    });
  
    var matchObj = null;
    var opts = {};
    BlogPost.plugin(flatMatcher, opts);
    matchObj = BlogPost.getMatchObj(matchArgs);    
    expectedMatchObj.should.eql(matchObj);
    
    post.save( function (err) {
      should.strictEqual(null, err);
      BlogPostModel.find(matchObj, function (err, found) {
        should.strictEqual(null, err);          
        found = found[0];     
        found.get('title').valueOf().should.equal(testTitle);
        // Test that the object returned has the array with all elements, not just those matched on the $in
        found.get('numbers').should.have.length(3);
        found.get('numbers').indexOf(4).should.not.equal(-1);
        found.get('numbers').indexOf(5).should.not.equal(-1);          
        found.get('numbers').indexOf(6).should.not.equal(-1);
        
        testCount += 1;
        db.close();
      });
    });    
  }()),

  'schema.getMatchObj() should return correct MongodDB matcher object with dot notation for object type in array and use it to retrieve data': (function () {        
    var collection = 'flatmatcher_4'
      , db = start()
      , BlogPostModel = db.model('BlogPost', collection);
  
    var testTitle = 'Dot Notation Object Type Embedded Array Test';
    var matchArgs = {title : testTitle, 'comments.title' : 'Great comment!'};    
    // Comments is array type, at root level, storing objects, passed one value, so dot notation path for matching one value is the nested property name
    var expectedMatchObj = {title: testTitle, 'comments.title' : 'Great comment!'};
    var post = new BlogPostModel({
      title: testTitle,
      comments : [{title : 'Great comment!', date : new Date(), body : 'I totally agree!', comments : []}]
    });
    
    var matchObj = null;
    var opts = {};      
    BlogPost.plugin(flatMatcher, opts);
    matchObj = BlogPost.getMatchObj(matchArgs);    
    expectedMatchObj.should.eql(matchObj);
    
    post.save( function (err) {
      should.strictEqual(null, err);
      BlogPostModel.find(matchObj, function (err, found) {
        should.strictEqual(null, err);          
        found = found[0];            
        found.get('title').valueOf().should.equal(testTitle);
        found.get('comments').should.have.length(1);
        found.get('comments')[0].title.should.equal('Great comment!');
        found.get('comments')[0].body.should.equal('I totally agree!');
        
        testCount += 1;
        db.close();
      });
    });    
  }()),

  'schema.getMatchObj() should return correct MongodDB matcher object with $in notation for matching multiple objects in embedded arrays': (function () {
    var testTitle = 'Dot Notation MutliValue Objects in Embedded Array Test';
    var postDate = new Date();
    // Matching array of embedded objects in embedded arrays requires "$in" operator and an array of literal objects that exactly match complete objects in the DB
    var matchArgs = {title : testTitle, comments : [{title : 'First comment', date: postDate, body : 'No way', comments : [{title: 'inside'}]}]};    
    // Numbers is array type, at root level, passed multiple values, so $in notation for matching 
    var expectedMatchObj = {title: testTitle, comments : {'$in' : [{title : 'First comment', date : postDate, body : 'No way', comments : [{title: 'inside'}]}]}};
    var opts = {};
    BlogPost.plugin(flatMatcher, opts);
    var matchObj = BlogPost.getMatchObj(matchArgs);        
    expectedMatchObj.should.eql(matchObj);
    
    testCount += 1;
  }())  
};

// Pathetic violation of DRY to use near-identical code as found
//  in '../node_modules/mongoose/test/common.js', but that
//  handler isn't assigned to a var there and isn't exported.
process.on('exit', function(){  
  var table = new Table({
      head: ['Stat', 'Time (ms)']
    , colWidths: [33, 15]
  });

  table.push(
      ['mongoose-flatmatcher Tests Run', testCount]
    , ['Time elapsed', Date.now() - startTime]
  );

  console.log(table.toString());
});  


