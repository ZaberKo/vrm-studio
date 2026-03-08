const BLINK_CLOSE_MAX = 0.12;
const BLINK_OPEN_MAX = 5;

export class AutoBlink {
  constructor(expressionManager) {
    this._expressionManager = expressionManager;
    this._remainingTime = 0;
    this._isOpen = true;
    this._isAutoBlink = true;
  }

  setEnable(isAuto) {
    this._isAutoBlink = isAuto;
    if (!this._isOpen) {
      return this._remainingTime;
    }
    return 0;
  }

  update(delta) {
    if (!this._expressionManager) return;

    if (this._remainingTime > 0) {
      this._remainingTime -= delta;
      return;
    }

    if (this._isOpen && this._isAutoBlink) {
      this.close();
      return;
    }

    this.open();
  }

  close() {
    this._isOpen = false;
    this._remainingTime = BLINK_CLOSE_MAX;
    this._expressionManager.setValue("blink", 1);
  }

  open() {
    this._isOpen = true;
    this._remainingTime = BLINK_OPEN_MAX;
    this._expressionManager.setValue("blink", 0);
  }
}
