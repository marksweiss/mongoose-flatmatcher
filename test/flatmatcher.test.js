var should = require('should')
    , mongoose = require('mongoose')
    , Schema = mongoose.Schema
    , ObjectId = Schema.ObjectId
    , flatMatcher = require('../flatmatcher.js');

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

BlogPost.method('cool', function(){
  return this;
});

BlogPost.static('woot', function(){
  return this;
});

mongoose.model('BlogPost', BlogPost);

var collection = 'blogposts_' + Math.random();

// Use of should for testing, style of tests modeled directly after Mongoose tests
module.exports = {

  'model.matcher() should return correct MongodDB matcher object with dot notation and use it to retrieve data': function () {        
    var db = start()
      , BlogPost = db.model('BlogPost', collection);

		// Matches attributes with simple types at root level and nested attributes
		var testTitle = 'Dot Notation Test';		
    var matchArgs = {title : testTitle, published : true, visitors : 5};    
    var expectedMatcher = {title: testTitle, published: true, 'meta.visitors': 5};
    
    // Now actually insert some data and retrieve it with find() using the matcher    
    var post = new BlogPost({
      title: testTitle,
      published : true
    });
    var matcher = null;
    var opts = {};
    
    // Use Mongoose #plugin() to decorate Schema with getMatcher() function
    BlogPost.plugin(flatMatcher, opts);
    // Call matcher to transform matchArgs JSON to flattened predicate
    matcher = BlogPost.getMatcher(matchArgs);    
    // Test that we get the expected matcher JSON object for the flat matchArgs
    // matchArgs cover literal types at root level, nested object and embedded array
    should.eql(expectedMatcher, matcher);
    
    post.save( function (err) {
      should.strictEqual(null, err);
      post.set('meta.visitors', 5);
      post.save( function (err) {
        should.strictEqual(null, err);
        // Use the matcher generated from flat args here to match nested obj, embedded array        
        BlogPost.find(matcher, function (err, found) {
          should.strictEqual(null, err);          
          found = found[0];     
          // Test the values of the document returned, matching literals a base level
          //  and also nested object and embedded array values
          found.get('title').valueOf().should.equal(testTitle);
          found.get('published').valueOf().should.equal(true);
          found.get('meta.visitors').valueOf().should.equal(5);
          db.close();
        });
      });
    });    
  },
  
  'model.matcher() should return correct MongodDB matcher object with dot notation for matching single simple values in embedded arrays and use it to retrieve data': function () {
    var db = start()
      , BlogPost = db.model('BlogPost', collection);

		var testTitle = 'Dot Notation Simple Embedded Array Test';
    var matchArgs = {title : testTitle, numbers : 4};    
		// Numbers is array type, at root level, passed one value, so dot notation path for matching one value is simply the property name	
    var expectedMatcher = {title: testTitle, numbers : 4};    
    var post = new BlogPost({
      title: testTitle,
      numbers : [4]
    });
    var matcher = null;
    var opts = {};
    
    BlogPost.plugin(flatMatcher, opts);
    matcher = BlogPost.getMatcher(matchArgs);    
    should.eql(expectedMatcher, matcher);
        
    post.save( function (err) {
      should.strictEqual(null, err);
      BlogPost.find(matcher, function (err, found) {
        should.strictEqual(null, err);          
        found = found[0];     
        found.get('title').valueOf().should.equal(testTitle);
        found.get('numbers').should.have.length(1);
        found.get('numbers')[0].should.equal(4);
        db.close();
      });
    });    
  },
  
  'model.matcher() should return correct MongodDB matcher object with $in notation for matching multiple simple values in embedded arrays and use it to retrieve data': function () {
    var db = start()
      , BlogPost = db.model('BlogPost', collection);

		var testTitle = 'Dot Notation MutliValue Embedded Array Test';
    var matchArgs = {title : testTitle, numbers : [4, 5]};    
		// Numbers is array type, at root level, passed multiple values, so $in notation for matching 
		var expectedMatcher = {title: testTitle, numbers : {'$in' : [4, 5]}};
    var matcher = null;
    var opts = {};
    var post = new BlogPost({
      title: testTitle,
      numbers : [4, 5, 6]
    });

    BlogPost.plugin(flatMatcher, opts);
    matcher = BlogPost.getMatcher(matchArgs);    
    should.eql(expectedMatcher, matcher);
    
    post.save( function (err) {
      should.strictEqual(null, err);
      BlogPost.find(matcher, function (err, found) {
        should.strictEqual(null, err);          
        found = found[0];     
        found.get('title').valueOf().should.equal(testTitle);
        // Test that the object returned has the array with all elements, not just those matched on the $in
        found.get('numbers').should.have.length(3);
        found.get('numbers').indexOf(4).should.not.equal(-1);
        found.get('numbers').indexOf(5).should.not.equal(-1);          
        found.get('numbers').indexOf(6).should.not.equal(-1);
        db.close();
      });
    });    
  },
  
  'model.matcher() should return correct MongodDB matcher object with dot notation for object type in array and use it to retrieve data': function () {        
    var db = start()
      , BlogPost = db.model('BlogPost', collection);

		var testTitle = 'Dot Notation Object Type Embedded Array Test';
    var matchArgs = {title : testTitle, 'comments.title' : 'Great comment!'};    
		// Comments is array type, at root level, storing objects, passed one value, so dot notation path for matching one value is the nested property name
    var expectedMatcher = {title: testTitle, 'comments.title' : 'Great comment!'};
    var post = new BlogPost({
      title: testTitle,
      comments : [{title : 'Great comment!', date : new Date(), body : 'I totally agree!', comments : []}]
    });
    var matcher = null;
    var opts = {};      
    
    BlogPost.plugin(flatMatcher, opts);
    matcher = BlogPost.getMatcher(matchArgs);    
    should.eql(expectedMatcher, matcher);
    
    post.save( function (err) {
      should.strictEqual(null, err);
      BlogPost.find(matcher, function (err, found) {
        should.strictEqual(null, err);          
        found = found[0];            
        found.get('title').valueOf().should.equal(testTitle);
        found.get('comments').should.have.length(1);
        found.get('comments')[0].title.should.equal('Great comment!');
        found.get('comments')[0].body.should.equal('I totally agree!');
        db.close();
      });
    });    
  },
  
  'model.matcher() should return correct MongodDB matcher object with $in notation for matching multiple objects in embedded arrays': function () {
    var testTitle = 'Dot Notation MutliValue Objects in Embedded Array Test';
        var postDate = new Date();
    // Matching array of embedded objects in embedded arrays requires "$in" operator and an array of literal objects that exactly match complete objects in the DB
    var matchArgs = {title : testTitle, comments : [{title : 'First comment', date: postDate, body : 'No way', comments : [{title: 'inside'}]}]};    
    // Numbers is array type, at root level, passed multiple values, so $in notation for matching 
    var expectedMatcher = {title: testTitle, comments : {'$in' : [{title : 'First comment', date : postDate, body : 'No way', comments : [{title: 'inside'}]}]}};
    BlogPost.plugin(flatMatcher, opts);
    var matcher = BlogPost.getMatcher(matchArgs);
        
    should.eql(expectedMatcher, matcher);   
  }
};
