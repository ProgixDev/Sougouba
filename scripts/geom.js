// Raise the Simulator and report the device screen's rect on the desktop.
// The device screen is the window's AXGroup child; the Simulator applies its own
// zoom, so the mapping is never 1:1 with device points.
function run() {
  const se = Application('System Events');
  Application('Simulator').activate();
  delay(0.35);
  const win = se.processes['Simulator'].windows[0];
  try { win.actions['AXRaise'].perform(); } catch (e) {}
  delay(0.2);
  const g = win.groups[0];
  const p = g.position();
  const s = g.size();
  const w = win.position();
  return [p[0], p[1], s[0], s[1], w[0], w[1]].join(' ');
}
