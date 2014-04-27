var expio = require( 'express.io' ),
	app   = expio();
app.http().io();
app.use( expio.static( __dirname + '/www' ) );

var request = require( 'request' ),
	crypto  = require( 'crypto/md5' ),
	tz      = require( 'timezoner' ),
	moment  = require( 'moment' );

// This is needed if the app is run on heroku:
var port = process.env.PORT || 8888;

// For all requests, send back our index
app.all( '*', function( req, res ) {
	res.sendfile(__dirname + '/index.html');
});

// Ready event sent when we know which room we want to connect to
app.io.route( 'ready', function( req ) {
	console.log( 'User connected to room: ' + req.data );

	// @todo Load current members from DB and send, or peer to peer somehow?

	req.io.join( req.data );
});

// User events come whenever we want to update a user's details (or add a new one)
app.io.route( 'user', function( req ) {
	// @todo Store/update user in some sort of database: Mongo, or peer to peer somehow?

	var user = req.data.user;
	if ( !user.filled ) {

		// Request their profile from Gravatar
		var url = 'https://secure.gravatar.com/' + crypto.hex_md5( user.email.trim().toLowerCase() ) + '.json',
			opts = {
				url: url,
				headers: {
					'User-Agent': 'Locabuddies' // User agent is required for Gravatar profiles requests
				}
			};
		request( opts, function( err, res, body ) {
			var profile = JSON.parse( body );
			if ( profile && profile.entry ) {
				var p = profile.entry[0];
				user.name = ( p.displayName && p.displayName ) || user.email;
				user.picture = p.thumbnailUrl;

				// Re-broadcast
				app.io.room( req.data.room ).broadcast( 'user', user );
			}
		});

		// See if we can get their timezone from Google
		tz.getTimeZone(
			user.location[0],
			user.location[1],
			function( err, data ) {
				if ( !err && 'OK' === data.status ) {
					user.offset = data.rawOffset / 60 / 60; // hours

					// Re-broadcast
					app.io.room( req.data.room ).broadcast( 'user', user );
				}
			}
		);

		// Avoid re-requesting this user in this session
		user.filled = true;
	}
});

// console.log( email + ' connected to ' + room + ' from ' + coords.lat ', ' + coords.long );

// Let's go
app.listen( port );
console.log( 'Locabuddies is running on http://localhost:' + port );
