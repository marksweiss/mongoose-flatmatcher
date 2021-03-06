var FlatMatcher = (function () {        
  /**
   * Returns the correct MongoDB query syntax JSON for flat JSON object of properties/values to be used
   *  as Mongo query predicate 
   *
   * @see FlatMatcher#buildMatcherLookup
   * @param {Object} matchArgs JSON properties/values to use in a query matching documents of this Model's Schema
   * @api public
   */    
  var getMatchObj = function (matchArgs) {
    
    // Helpers
  	var isArray = function (value) {
  	 	return Object.prototype.toString.apply(value) === '[object Array]';
  	};
  	
    /**
     * Internal helper supporting FlatMatcher#getMatcher.
     *
     * @see FlatMatcher#getMatcher
     * @param {String} pathString dot-notation prefix for current traversal of properties in the Schema
     * @param {Object} tree the Schema#tree property for the Schema
     * @param {Object} matcherLookup the return value mapping flat property names to dot-notation paths, value casting functions and isArray flags
     * @param {Number} depth depth of recursion of call
     * @api private
     */
    var buildMatcherLookup = function (pathString, tree, matcherLookup, depth) {    
      // Guard against arbitrarily deep recursion for properties that are 
      //   object/Schema types with properties that are other object/Schema types forming a cycle
      if (depth > maxDepth) {
        return matcherLookup;
      }
      depth += 1;

      // Helpers
      var MatcherLookupEntry = function (p, c, a) {
        return {pathString : p, caster : c, isArray : a};
      };
      // Guard against overwriting existing entries. As documented, this function will only behave as expected
      //  if all properties in Schema at all levels have unique names. So the function creates an entry only for
      //  the first instance of any name encountered without qualifying it with its full dot notation path (the
      //  entire point of using the Matcher.)  But it will create dot-notation qualified entries if there is a 
      //  clash, so these can be accessed by full path.  
      var makeLookupEntry = function (prop, pathString, caster, isArrayVal) {
        var entry = MatcherLookupEntry(pathString, caster, isArrayVal);    
        if (! matcherLookup.hasOwnProperty(prop)) {
          matcherLookup[prop] = entry;        
        }
        else {
          matcherLookup[pathString] = entry;        
        }    
      };

      var isArray = function (value) {
        return Object.prototype.toString.apply(value) === '[object Array]';
      };

      var isFunction = function (value) { 
         return typeof value === 'function'; 
      };  

      var isObject = function (value, literal) {
        var type = typeof value, test = !!value && type === 'object';
        return test && literal ? value.constructor === Object : test;
      };  

      var isMongooseSchema = function (v) {
        return (isObject(v) && v.hasOwnProperty('paths') && v.hasOwnProperty('tree')); 
      };

      var mongooseSchemaTreeEquals = function (s1, s2) {
        var objLen = function (o) {
          var l = 0;
          for (prop in o) {
            l += 1;
          }
          return l;
        };
        var isSamePropertyVal = function (pv1, pv2) {
          if ( (isArray(pv1) && isArray(pv2)) || (isFunction(pv1) && isFunction(pv2)) || 
               (isObject(pv1) && isObject(pv2)) || (isMongooseSchema(pv1) && isMongooseSchema(pv2)) ) {
            return true;
          }
          return false;
        };

        // Compare the tree property of each Schema object for same length    
        var l1, l2;
        if ((l1 = objLen(s1)) !== (l2 = objLen(s2))) {
          return false; 
        }

        // Iterate  each tree, insuring same property names and Schema data types
        for (prop in s1) {
          if (! prop in s2) {
            return false;
          }
          else if (! isSamePropertyVal(s1[prop], s2[prop])) {
            return false;
          }
        }
           
        return true;
      };

      var noOpCaster = function (value) {
        return value;
      };
      // /Helpers

      var propVal = null;
      var curPathString = pathString;
      var isArrayVal = false;
      var literal = 1;

      for (prop in tree) {    
        pathString = curPathString;
        // Build dot-notation path
        if (pathString.length > 0) {
          pathString += '.';
        }
        pathString += prop;

        // NOTE: Depends on internal Schema property 'tree' property implementation.
        // tree is an object with a structure mirroring the Schema definition.
        // Properties are fields in the Schema.  Their value is:
        //  - a casting function for the type of data the field holds, if the field is a simple type
        //    i.e. string, number, boolean or date
        //  - a nested object if the field contains nested objects
        //  - a nested MongooseSchema (a specific object type) if the field holds nested Schemas
        //  - an array if the field holds any type of value in an embedded array
        propVal = tree[prop];

        if (isArrayVal = isArray(propVal)) {   
          // Arrays can be empty in Mongoose, contain a compound type (object or Schema) or a simple type
          // Arrays are empty or homogenous (have values of only one type).  So if the tree value is an array:
          //  - if the array in the tree contains a function, then the function is the caster
          //  - if the array in the tree contains objects or Schema objects, create two entries:
          //   - one is recurse to build dot notation for matching single objects in arrays
          //   - one is an entry at the array level without dot notation into the object, passing literal through
          //     because matching more than one object using $in requires matching on an array of literal values 
          //  - if the array in the tree is empty (which is legal in Mongoose), then we can't know what type the
          //    array may contain, so create an entry that passes through literal values to match exactly
          if (propVal.length === 0)
          {
            makeLookupEntry(prop, pathString, noOpCaster, isArrayVal);
            continue;
          }
          else {
            propVal = propVal[0];        
          }
        }            

        if (isFunction(propVal, literal)) {
          makeLookupEntry(prop, pathString, propVal, isArrayVal);
        }
        else if(isMongooseSchema(propVal)) {
          // Embedded object in array, create entry for literal match as per comment above
          if (isArrayVal) {
            makeLookupEntry(prop, pathString, noOpCaster, isArrayVal);
          }

          // If embedded Schema is a a child property of the same Schema, we know we have endless recursion, 
          /// so just support one level of recursion from here
          if (mongooseSchemaTreeEquals(tree, propVal.tree) && depth < maxDepth) {
            depth = maxDepth;
          }

          // Recurse
          matcherLookup = buildMatcherLookup(pathString, propVal.tree, matcherLookup, depth);
        }
        else if (isObject(propVal)) {
          if (isArrayVal) {
            makeLookupEntry(prop, pathString, noOpCaster, isArrayVal);
          }

          // Always recurse on embedded plain objects (not Schemas), because these aren't as much "types"
          //  as Schemas so there isn't as clear a case of identifying self-reference children and cycles. So
          //  just allow and guard against stack overflow
          matcherLookup = buildMatcherLookup(pathString, propVal, matcherLookup, depth);      
        }
      }

      return matcherLookup;
    };  	
  	// /Helpers
  	
  	// The JSON set of document properties/values to return
  	var pathString = '';
  	var matcherLookup = {};
  	var depth = 0;
  	matcherLookup = buildMatcherLookup(pathString, this.tree, matcherLookup, depth);

  	// JSON in valid MongoDB dot-notation and "$in" syntax to be match pred in find(), update() and delete() Mongo calls
  	var matchObj = {};
  	var propVal = null;
  	var mlEntry = null;
  	var j = 0;

  	for (prop in matchArgs) {	  
  		if (matcherLookup.hasOwnProperty(prop)) {		  
    	  propVal = matchArgs[prop];
  		  mlEntry = matcherLookup[prop];

  		  // Handle embedded array cases 
  		  if (mlEntry.isArray) {		    
  		    // Client can pass in single values or array of values to match against array fields
  		    // Single values match with standard dot notation, as MongoDB transparently searches the embedded array for
  		    //  all objects matching the predicate value
  		    // Multiple values work like SQL "IN", meaning MongoDB searches the embedded array for all objects matching *any*
  		    //  of the values in the predicate.  Multiple values require "$in" operator in matcher.
  		    if (isArray(propVal)) {
    		    // Loop over all values, cast each one
    		    for (j = 0; j < propVal.length; j += 1) {  		      
    		      propVal[j] = mlEntry.caster(propVal[j]);
    		    }

    		    matchObj[mlEntry.pathString] = {"$in" : propVal};
    		  }
    		  else {
    		    matchObj[mlEntry.pathString] = mlEntry.caster(propVal);
    		  }		    
  		  }
  		  // Matching single value field
  		  else {
  		    matchObj[mlEntry.pathString] = mlEntry.caster(propVal);
  		  }
  		}
  	}

  	return matchObj;
  };

  /**
   * Default maximum recursion depth for building flat matcher from Schema.tree. Protects against cycles.
   * @api private
   */
  var maxDepth = 5; 
  /**
   * Gets the maximum depth the FlatMatcher will recurse on Schema to build matcher from args
   * @api public
   */    
  var getMaxDepth = function () {
    return maxDepth;
  };
  /**
   * Sets the maximum depth the FlatMatcher will recurse on Schema to build matcher from args. Default is 5.
   *  Note: protects against cycles which will never exit recursion, so should be set to some reasonable value.
   *
   * @param {Number} depth value for maximum recursion depth
   * @api public
   */    
  var setMaxDepth = function (depth) {
    maxDepth = depth;
  };
  
  return {   
    plugin : function (schema, opts) {
      schema['getMatchObj'] = getMatchObj;
      // Store schema tree as child prop of method, so it's a closure
      //  that includes this property of the schema being decorated.
      // Must do this because 'this' context of getMatchObj() calls are its
      //  own scope and schema.tree wouldn't otherwise be available.
      schema.getMatchObj.tree = schema.tree;
      schema['setMaxDepth'] = setMaxDepth;
      schema['getMaxDepth'] = getMaxDepth;  
    }
  };
}());

exports.plugin = FlatMatcher.plugin;

