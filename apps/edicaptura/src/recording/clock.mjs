export class RecordingClock {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.total = 0;
    this.since = null;
  }
  resume() {
    if (this.since === null) this.since = this.now();
  }
  pause() {
    if (this.since !== null) {
      this.total += this.now() - this.since;
      this.since = null;
    }
  }
  elapsed() {
    return this.total + (this.since === null ? 0 : this.now() - this.since);
  }
}
