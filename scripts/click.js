// Post a real CGEvent click at absolute screen coordinates.
//
// Real CGEvents are required — System Events' `click at {x,y}` never reaches the
// Simulator. kCGMouseEventClickState (field id 1) must be 1 or the click is
// silently ignored. Geometry and window raising are handled by tap.sh, so this
// script stays a pure clicker and cannot fail on an AX index lookup.
ObjC.import('CoreGraphics');

function run(argv) {
  const x = parseFloat(argv[0]);
  const y = parseFloat(argv[1]);
  const pt = $.CGPointMake(x, y);
  const down = $.CGEventCreateMouseEvent($(), $.kCGEventLeftMouseDown, pt, $.kCGMouseButtonLeft);
  const up = $.CGEventCreateMouseEvent($(), $.kCGEventLeftMouseUp, pt, $.kCGMouseButtonLeft);
  $.CGEventSetIntegerValueField(down, 1, 1);
  $.CGEventSetIntegerValueField(up, 1, 1);
  $.CGEventPost($.kCGHIDEventTap, down);
  delay(0.05);
  $.CGEventPost($.kCGHIDEventTap, up);
  return `clicked ${x},${y}`;
}
