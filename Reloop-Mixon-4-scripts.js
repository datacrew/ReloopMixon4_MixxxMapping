
/************************  GPL v2 licence  *****************************
 *  Reloop Mixon 4 controller script
 *  Author: Markus Feicht <markus.feicht78@gmail.com>
 *
 *  Rewritten from Reloop Beatmix 2/4 script 
 *
 **********************************************************************
 * User References
 * ---------------
 *
 * Thanks
 * ----------------
 * Thanks to Sébastien Blaisot for the Reloop Beatmix 2/4 implementation
 * 
 *                           GPL v2 licence
 *                           --------------
 * Reloop Beatmix controller script script 2.0.0 for Mixxx 2.4+
 * Copyright (C) 2016 Sébastien Blaisot
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 ***********************************************************************/
////////////////////////////////////////////////////////////////////////
// JSHint configuration                                               //
////////////////////////////////////////////////////////////////////////
/* global print                                                       */
////////////////////////////////////////////////////////////////////////

const JogFlashWarningTime = 30;
const JogFlashCriticalTime = 15;

var ReloopMixon4 = {};
const RateRangeArray = [0.08, 0.1, 0.12, 0.16];
const jogWheelTimers = [];
const loadButtonTimers = [];
const loadButtonLongPressed = [];
const FxModeTimers = [];
const FxModeLongPressed = [];

const previousValue = [];

// Trax mode
// 1 for playlist mode
// 2 for track mode
// 3 for preview mode
let traxMode = 2;

// Effects mode
// 1 for single Effect
// 2 for multi Effect
// SHIFT + long press on pitchbend +/- to change mode
let FxMode = 1;

// Jog LED
const JogRPM = 33.0 + 1 / 3;
const RoundTripTime = 60.0 / JogRPM;
const JogLedNumber = 16;
const JogBaseLed = 0x11;
const JogFlashWarningInterval = 400;
const JogFlashCriticalInterval = 200;

const JogLedLit = [];
const channelPlaying = [];
const JogBlinking = [];

const ON = 0x7f;
const OFF = 0x00;
const ALLJOGON = 0x10;
const ALLJOGOFF= 0x00;
const RED = 0x30;
const VIOLET = 0x33;
const BLUE = 0x03;
const GREEN = 0x0c;
const SHIFT = 0x40;
const DOWN = 0x7f;
const UP = 0x00;

const ControllerStatusSysex = [0xF0, 0x00, 0x20, 0x7F, 0x03, 0x01, 0xF7];

const channelRegEx = /\[Channel(\d+)\]/;
const samplerRegEx = /\[Sampler(\d+)\]/;

ReloopMixon4.TurnLEDsOff = function () {
  let i, j;
  for (i = 0x90; i <= 0x93; i++) {
    // PADS
    for (j = 0x00; j <= 0x3f; j++) {
      midi.sendShortMsg(i, j, OFF);
      midi.sendShortMsg(i, j + SHIFT, OFF);
    }
    // LOOP PARAMETER PLAY CUE SYNC
    for (j = 0x08; j < 0x0e; j++) {
      midi.sendShortMsg(i + 0x04, j, OFF);
      if (j >= 0x0a) {
        midi.sendShortMsg(i + 0x04, j + SHIFT, OFF);
      }
    }
    // MIXER TRAX
    for (j = 0x01; j <= 0x03; j++) {
      midi.sendShortMsg(j === 0x01 ? 0x0a : i + 0x04, j, OFF);
    }
    //for (j = 0x00; j <= 0x7F; j++) {
    //    midi.sendShortMsg(i, j, OFF);
    //}
  }
  // EFFECT
  for (i = 0x98; i <= 0x99; i++) {
    for (j = 0x00; j < 0x04; j++) {
      midi.sendShortMsg(i, j, OFF);
    }
  }
  // PITCH
  for (i = 0xE4; i <= 0xE7; i++) {
    midi.sendShortMsg(i, 0xd1, OFF);
  }
  //  MISC
  for (i = 0x94; i <= 0x97; i++) {
    // PITCH LED
    midi.sendShortMsg(i, 0x15, OFF); // PITCH LED
    midi.sendShortMsg(i, 0x0f, OFF); // SLIP
    midi.sendShortMsg(i, 0x0f + SHIFT, OFF); // SLIP
    midi.sendShortMsg(i, 0x10, OFF); // KEY LOCK
    midi.sendShortMsg(i, 0x10 + SHIFT, OFF); // KEY LOCK
    midi.sendShortMsg(i, 0x25, OFF); // KEY LOCK (hold)
    midi.sendShortMsg(i, 0x25 + SHIFT, OFF); // KEY LOCK (hold)
    midi.sendShortMsg(i, 0x11, OFF); // KEY SYNC
    midi.sendShortMsg(i, 0x11 + SHIFT, OFF); // KEY SYNC
    midi.sendShortMsg(i, 0x24, OFF); // KEY SYNC dbl press
  }
  for(i = 0xB4; i <=0xB7; i++){
    midi.sendShortMsg(i,0x06,0x00);
  }
  // Maybe more lets see
};

ReloopMixon4.connectControls = function () {
  let group;
  for (let i = 1; i <= 4; i++) {
    group = "[Channel" + i + "]";
    engine.makeConnection(group, "track_loaded", ReloopMixon4.deckLoaded);
    engine.trigger(group, "track_loaded");
    engine.makeConnection(group, "play", ReloopMixon4.ChannelPlay);
    engine.trigger(group, "play");
    engine.makeConnection(group, "playposition", ReloopMixon4.JogLed);
    engine.trigger(group, "playposition");
    engine.makeConnection(group, "loop_end_position", ReloopMixon4.loopDefined);
    engine.trigger(group, "loop_end_position");
    engine.softTakeover(group, "rate", true);
    engine.setValue(
      "[EffectRack1_EffectUnit1]",
      "group_" + group + "_enable",
      0
    );
    engine.setValue(
      "[EffectRack1_EffectUnit2]",
      "group_" + group + "_enable",
      0
    );
    engine.setValue(
      "[EffectRack1_EffectUnit3]",
      "group_" + group + "_enable",
      0
    );
    engine.trigger('[EffectRack1_EffectUnit1]','group_' + group + '_enable');
    engine.trigger('[EffectRack1_EffectUnit2]','group_' + group + '_enable');
    engine.trigger('[EffectRack1_EffectUnit3]','group_' + group + '_enable');
    channelPlaying[group] = !!engine.getValue(group, "play");
    JogBlinking[group] = false;
  }

  for (let i = 1; i <= 8; i++) {
    group = "[Sampler" + i + "]";
    engine.makeConnection(group, "track_loaded", ReloopMixon4.deckLoaded);
    engine.trigger(group, "track_loaded");
    engine.makeConnection(group, "play", ReloopMixon4.SamplerPlay);
    engine.trigger(group, "play");
  }
  // Effects reset
  engine.setValue("[EffectRack1_EffectUnit1]", "group_[Master]_enable", 0);
  engine.setValue("[EffectRack1_EffectUnit2]", "group_[Master]_enable", 0);
  engine.setValue("[EffectRack1_EffectUnit3]", "group_[Master]_enable", 0);
};

ReloopMixon4.init = function (id, _debug) {
  ReloopMixon4.id = id;
  ReloopMixon4.TurnLEDsOff();
  console.log('RELOOP MIXON 4 script loaded');
  if (engine.getValue("[App]", "num_samplers") < 8) {
    engine.setValue("[App]", "num_samplers", 8);
  }
  
  ReloopMixon4.connectControls();
  for (let i = 1; i <= 4; i++) {
    engine.trigger("[Channel" + i + "]", "loop_end_position");
  }
  engine.beginTimer(1500, () => {
    console.log('Reloop Mixon 4: ${id} Requesting Controller Status');
    midi.sendSysexMsg(ControllerStatusSysex, ControllerStatusSysex.length);
  }, true );

  console.log("Reloop Mixon 4: " + id + " initialized.");
};

ReloopMixon4.shutdown = function () {
  ReloopMixon4.TurnLEDsOff();
  console.log("Reloop Mixon 4: " + ReloopMixon4.id + " shut down.");
};
ReloopMixon4.GetNextRange = function (previous) {
  const len = RateRangeArray.length;
  const pos = RateRangeArray.indexOf(previous);
  return RateRangeArray[(pos + 1) % len];
};

ReloopMixon4.Range = function (channel, control, value, status, group) {
  if (value === DOWN) {
    const oldvalue = engine.getValue(group, "rateRange");
    engine.setValue(group, "rateRange", ReloopMixon4.GetNextRange(oldvalue));
    engine.softTakeoverIgnoreNextValue(group, "rate");
  }
};

ReloopMixon4.MasterSync = function (channel, control, value, status, group) {
  if (value === DOWN) {
    script.toggleControl(group, "sync_enabled");
  }
};

ReloopMixon4.LoopSet = function (channel, control, value, status, group) {
  if (value === DOWN) {
    engine.setValue(group, "loop_in", 1);
  } else {
    engine.setValue(group, "loop_out", 1);
  }
};

ReloopMixon4.PitchSlider = function (channel, control, value, status, group) {
  engine.setValue(group, "rate", -script.midiPitch(control, value, status));
};

// Trax
ReloopMixon4.traxSelect = function (value, step) {
  switch (traxMode) {
    case 1: // Playlist Mode
      for (let i = 0; i < Math.abs(value); i++) {
        for(let j = 0; j < step; j++){
            if (value < 0) {
                engine.setValue("[Playlist]", "SelectPrevPlaylist", true);
            } else {
                engine.setValue("[Playlist]", "SelectNextPlaylist", true);
            }
        }
      }
      break;
    case 2: // Track mode
      engine.setValue("[Playlist]", "SelectTrackKnob", value * step);
      break;
    case 3: // Preview mode
      engine.setValue(
        "[PreviewDeck1]",
        "playposition",
        Math.max(
          0,
          Math.min(
            1,
            engine.getValue("[PreviewDeck1]", "playposition") +
              0.02 * value * step
          )
        )
      );
      break;
  }
};

ReloopMixon4.TraxTurn = function (channel, control, value, _status, _group) {
  ReloopMixon4.traxSelect(value - 0x40, 1);
};
ReloopMixon4.ShiftTraxTurn = function (channel,control,value,_status,_group) {
  ReloopMixon4.traxSelect(value - 0x40, 10);
};
ReloopMixon4.TraxPush = function (channel, control, value, _status, _group) {
  switch (traxMode) {
    case 1: // Playlist mode
      engine.setValue("[Playlist]", "ToggleSelectedSidebarItem", value);
      break;
    case 2: // Track mode
      engine.setValue("[PreviewDeck1]", "LoadSelectedTrackAndPlay", value);
      traxMode = 3;
      break;
    case 3: // Preview mode
      if (value === DOWN) {
        script.toggleControl("[PreviewDeck1]", "play");
      }
      break;
  }
};
ReloopMixon4.BackButton = function (channel, control, value, _status, _group) {
  if (value === DOWN) {
    switch (traxMode) {
      case 1: // Playlist mode
        traxMode = 2;
        break;
      case 2: //. Track mode
        traxMode = 1;
        break;
      case 3: // Preview mode
        traxMode = 2;
        break;
    }
  }
};

ReloopMixon4.LoadButtonEject = function (group) {
  loadButtonLongPressed[group] = true;
  engine.setValue(group, "eject", 1);
  delete loadButtonTimers[group];
};
ReloopMixon4.LoadButton = function (channel, control, value, status, group) {
  if (value === DOWN) {
    loadButtonLongPressed[group] = false;
    loadButtonTimers[group] = engine.beginTimer(
      1000,
      () => {
        ReloopMixon4.LoadButtonEject(group);
      },
      true
    );
  } else {
    if (!loadButtonLongPressed[group]) {
      engine.stopTimer(loadButtonTimers[group]);
      delete loadButtonTimers[group];
      engine.setValue(group, "LoadSelectedTrack", 1);
    } else {
      engine.setValue(group, "eject", 0);
      loadButtonLongPressed[group] = false;
    }
  }
};
// Sampler
ReloopMixon4.SamplerPad = function (channel, control, value, status, group) {
  if (value === DOWN) {
    if (engine.getValue(group, "track_loaded")) {
      engine.setValue(group, "cue_gotoandplay", 1);
    } else {
      engine.setValue(group, "LoadSelectedTrack", 1);
    }
  }
};

ReloopMixon4.ShiftSamplerPad = function (channel, control, value, status, group) {
  if (value === DOWN) {
    if (engine.getValue(group, "track_loaded")) {
      if (engine.getValue(group, "play")) {
        engine.setValue(group, "cue_gotoandstop", 1);
      } else {
        engine.setValue(group, "eject", 1);
      }
    } else {
      engine.setValue(group, "LoadSelectedTrack", 1);
    }
  } else {
    if (!engine.getValue(group, "track_samples")) {
      engine.setValue(group, "eject", 0);
    }
  }
};

ReloopMixon4.SamplerVol = function (channel, control, value, status, group) {
  for (let i = 1; i < engine.getValue("[App]", "num_samplers"); i++) {
    engine.setValue("[Sampler" + i + "]", "volume", value / 127.0);
  }
};

// Jog Wheels
ReloopMixon4.WheelTouch = function (channel, control, value, status, group) {
  const deck = parseInt(group.substr(8, 1), 10);
  if (value === DOWN) {
    const alpha = 1.0 / 8;
    const beta = alpha / 32;
    engine.scratchEnable(deck, 800, JogRPM, alpha, beta);
  } else {
    engine.scratchDisable(deck);
  }
};

ReloopMixon4.WheelTurn = function (channel, control, value, status, group) {
  const newValue = value - 64;
  const deck = parseInt(group.substr(8, 1), 10);
  if (engine.isScratching(deck)) {
    engine.scratchTick(deck, newValue);
  } else {
    engine.setValue(group, "jog", newValue / 5);
  }
};

// Led Feedback
ReloopMixon4.AllJogLEDsToggle = function (deck, state, step) {
  step = typeof step !== "undefined" ? step : 1;
  //for (let j = 0x00; j <= 0x10; j += step) {
  //  midi.sendShortMsg(deck, j, state);
  //}
  let _shift = 0x00;
  if(deck == 0xB6 || deck == 0xB7){
    _shift = 0x40;
  }
  if(state == OFF){
    midi.sendShortMsg(deck, 0x06, 0x00);
  } else {
    midi.sendShortMsg(deck, 0x06, 0x10);
  }
};

ReloopMixon4.deckLoaded = function (value, group, control) {
  let i;
  switch (group.substr(1, 7)) {
    case "Channel":
      const channelChan = parseInt(channelRegEx.exec(group)[1]);
      if (channelChan <= 4) {
        // shut down load button
        midi.sendShortMsg(0x93 + channelChan, 0x50, value ? ALLJOGON : ALLJOGOFF);
        if (JogLedLit[group] !== undefined && !value) {
          midi.sendShortMsg(
            0xB3 + channelChan,0x06, 0x00
          );
          delete JogLedLit[group];
        }
      }
      break;
    case "Sampler":
      const samplerChan = parseInt(samplerRegEx.exec(group)[1]);
      if (samplerChan <= 8) {
        for (i = 0x90; i <= 0x93; i++) {
          // PAD1 Mode A
          midi.sendShortMsg(i, 0x10 - 1 + samplerChan, value ? RED : OFF);
          // SHIFT PAD 1 MOD A
          midi.sendShortMsg(i, 0x50 - 1 + samplerChan, value ? RED : OFF);
        }
      }
      break;
  }
};
ReloopMixon4.SamplerPlay = function (value, group, control) {
  const samplerChan = parseInt(samplerRegEx.exec(group)[1]);
  if (samplerChan <= 8) {
    let ledColor;
    if (value) {
      ledColor = VIOLET;
    } else {
      ledColor = engine.getValue(group, "track_samples") ? RED : OFF;
    }

    for (let i = 0x89; i <= 0x92; i++) {
      midi.sendShortMsg(i, 0x10 - 1 + samplerChan, OFF);
      midi.sendShortMsg(i, 0x10 - 1 + samplerChan, ledColor);

      midi.sendShortMsg(i, 0x50 - 1 + samplerChan, OFF);
      midi.sendShortMsg(i, 0x50 - 1 + samplerChan, ledColor);
    }
  }
};

ReloopMixon4.loopDefined = function (value, group, control) {
  const channelChan = parseInt(channelRegEx.exec(group)[1]);
  if (channelChan <= 4) {
    midi.sendShortMsg(0xB3 + channelChan, 0x54, value < 0 ? OFF : VIOLET);
  }
};

ReloopMixon4.ChannelPlay = function (value, group, control) {
  if (value) {
    channelPlaying[group] = true;
  } else {
    if (JogBlinking[group]) {
      engine.stopTimer(jogWheelTimers[group]);
      delete jogWheelTimers[group];
      JogBlinking[group] = false;
      const channelChan = parseInt(channelRegEx.exec(group)[1]);
      ReloopMixon4.AllJogLEDsToggle(0xB3 + channelChan, OFF, 2);
      engine.trigger(group, "playposition");
    }
    channelPlaying[group] = false;
  }
};

ReloopMixon4.JogLed = function (value, group, control) {
    if (engine.getValue(group, "track_loaded") === 0) {
        return;
    }
  const trackDuration = engine.getValue(group, "duration");
  const timeLeft = trackDuration * (1.0 - value);
  const channelChan = parseInt(channelRegEx.exec(group)[1]);

  if (channelPlaying[group] && timeLeft <= JogFlashWarningTime) {
    if (!JogBlinking[group]) {
      if (JogLedLit[group] !== undefined) {
        midi.sendShortMsg(
          0xB3 + channelChan,0x06,0x00
        );
        delete JogLedLit[group];
      }
      // Light all Jog Leds
      ReloopMixon4.AllJogLEDsToggle(0xB3 + channelChan, ALLJOGON, 2);
      jogWheelTimers[group] = engine.beginTimer(
        timeLeft <= JogFlashCriticalTime
          ? JogFlashCriticalInterval
          : JogFlashWarningInterval,
        () => {
          ReloopMixon4.jogLedFlash(group, ALLJOGON);
        },
        true
      );
      JogBlinking[group] = true;
    }
    return;
  }
const timePosition = trackDuration * value;
  const rotationNumber = timePosition / RoundTripTime;
  const positionInCircle = rotationNumber - Math.floor(rotationNumber);
  const ledToLight = Math.round(positionInCircle * JogLedNumber);
  if (JogLedLit[group] == ledToLight) {
    return;
  }
  midi.sendShortMsg(
    0xB3 + channelChan,0x06,
    JogBaseLed + ledToLight
  );
  //console.log('JOG LED VALUE', JogBaseLed + ((ledToLight + JogLedNumber - 1) % this.JogLedNumber), 'ledTolight', ledToLight);
  JogLedLit[group] = ledToLight;
};

ReloopMixon4.jogLedFlash = function (group, state) {
  const chan = parseInt(group.substr(1, 8), 10);
  ReloopMixon4.AllJogLEDsToggle(0xB3 + chan, state ? ALLJOGOFF : ALLJOGON, 2);
  const timeLeft = engine.getValue(group, "duration") * (1.0 - engine.getValue(group, "playposition"));
  if (timeLeft < JogFlashWarningTime) {
    const nextTime = timeLeft < JogFlashCriticalTime
        ? JogFlashCriticalInterval
        : JogFlashWarningInterval;
    jogWheelTimers[group] = engine.beginTimer(
      nextTime,
      () => {
        ReloopMixon4.jogLedFlash(group, state ? ALLJOGOFF : ALLJOGON);
      },
      true
    );
  } else {
    ReloopMixon4.AllJogLEDsToggle(0xB3 + chan, ALLJOGOFF);
    delete jogWheelTimers[group];
    JogBlinking[group] = false;
  }
};

ReloopMixon4.SetBeatLoop = function (channel, control, value, status, group) {
  const deck = parseInt(group.substr(8, 1), 10);
  const oldValue = engine.getValue(group, 'beatloop_size');
  const ranges = [1/32,1/16,1/8,1/4,1/2,1,2,4,8,16,32];
  let oldIndex = ranges.indexOf(oldValue);
  let newIndex = oldIndex;
  if (value == 0x3F){
    newIndex = Math.max(0,Math.min(ranges.length-1, oldIndex - 1));
  } else {
    newIndex = Math.max(0,Math.min(ranges.length-1, oldIndex + 1));
  }
  engine.setValue(group, 'beatloop_size', ranges[newIndex]);
}

ReloopMixon4.SetBeatJump = function (channel, control, value, status, group){
  const deck = parseInt(group.substr(8, 1), 10);
  const oldValue = engine.getValue(group, 'beatjump_size');
  const ranges = [1/32,1/16,1/8,1/4,1/2,1,2,4,8,16,32];
  let oldIndex = ranges.indexOf(oldValue);
  let newIndex = oldIndex;
  if (value == 0x3F){
    newIndex = Math.max(0,Math.min(ranges.length-1, oldIndex - 1));
  } else {
    newIndex = Math.max(0,Math.min(ranges.length-1, oldIndex + 1));
  }
  engine.setValue(group, 'beatjump_size', ranges[newIndex]);

}