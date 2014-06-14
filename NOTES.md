# TODO
## Next
- Include local time/name on markers

## Later
- Implement "message-stacking"
- Refine markers
- Implement animations for everything (see below)
- Render messages in correct order during initial load (sort based on time)
- "Reclaim" messages that are mine in the stream, and flip them to render properly
- Handle `*`, `\`, `/me`
- Autolink URLs
- Auto-embed image URLs

## Maybe
- Drag/drop media upload (direct to Cloudup?)
- Cloudup URL embeds

# Research Points
* app.all vs app.io.all usage?
* config module to read details from package.json? version in user agent
* Good main app "controller" when you don't need an actual Router?
* Socket.io stuff mixed into Backbone views? Seems super-wrong?
* Socket.io sessions/objects and how to keep track of rooms/clients per connection
* Keep count of client connections on Socket?
* Server disconnection/reconnection handling
* Detect client disconnection and broadcast that fact to other clients
* How to use require.js on the frontend to load all my modules cleanly?
* Mongo integration?

# Animations/UX
## Initial Load
1. Load page; map hidden (to allow pre-load) behind textured 'canvas'/background
1. Bubble-pop dialog into view, asking for email (or float down from top?)
1. Slidedown a banner explaining the Location request (if not already authorized)
1. Slideup banner once Location request is authorized
1. Zoom-spin the Settings cog into view (top-left)
1. Shrink-and-fade email dialog once details are entered
1. Fadeout 'canvas' to reveal map
1. Bubble-pop my map marker (if possible) into view (Location pin with round Gravatar overlay)
1. Slidedown banner telling user to share URL with others

## User Join (or load existing chat history)
1. If there is no chat panel yet; slide chat panel in from the right
1. Rezoom/center the map to account for the chat panel + new user's position, then
1. Bubble-pop their marker into view (or multiple)

## Chat
1. Messages always appear at the bottom of the chat stream
1. If this is a carry-on message..
 1. Expand their message bubble
 1. Fast-fade-in new message
1. If this is from any user other than the most recent...
 1. Slideup previous messages
 1. Fast-fade-in new message, sync with...
 1. Bubble-pop Gravatar
1. Always auto-scroll down to the bottom of the chat stream

## User Depart
1. Auto-message: "<name> has left the room."
1. Animate their Gravatar to grayscale in chat history
1. Fade map marker to grayscale, set timer for 1 minute, then...
1. Fade-and-remove marker from map

## Chat Functions
### URL Handling
- Image URLs should be converted to Photon-resized/constrained inline images
- Other URLs:
 - Attempt oEmbed for known sources
 - GET requests and parse headers for others; embed a visual block

### Commands
- Any chat message starting with `/` is treated as a command
- Unknown? Send back "message" as "I don't recognize `<command>`."
- If known, use command name to hand off payload to command handler

### Drag & Drop
1. Drag files over area (editor or stream)
1. Highlight border, "glow" effect, message "Drop media here to post to the room."
1. Animate progress bar across the top border of the chat message box
1. Embed via Cloudup embed once complete?
