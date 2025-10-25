/*
 *  Reloop Mixon 4 controller script
 *  Author: Markus Feicht <markus.feicht78@gmail.com>
 *  
 *  Rewritten from Reloop Beatmix 2/4 script   
 */

const JogFlashWarningTime = 30;
const JogFlashCriticalTime = 15;

var ReloopMixon4 = {};
const RateRangeArray = [0.08, 0.1, 0.12, 0.16];
const jogWheelTimers = [];
const loadButtonTimers = [];
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
const RoundTripTime = 60.0;
const JogLedNumber = 16;
const JogBaseLed = 0x01;
const JogLedWarningInterval = 400;
const JogLegCriticalInterval = 200;

const JogLedLit = [];
const channelPlaying = [];
const JogBlinking = [];

const ON = 0x7f;
const OFF = 0x00;
const RED = 0x30;
const VIOLET = 0x33;
const BLUE = 0x03;
const GREEN = 0x0C;
const SHIFT = 0x40;
const DOWN = 0x3F;
const UP = 0x00;

const channelRegEx = /\[Channel(\d+)\]/;
const samplerRegEx = /\[Sampler(\d+)\]/;

ReloopMixon4.TurnLEDsOff = function() {
    let i, j;
    for (i = 0x90; i <= 0x93; i++) {
        for (j = 0x00; j <= 0x7F; j++) {
            midi.sendShortMsg(i, j, OFF);
        }

    }
    // Maybe more lets see
};

ReloopMixon4.connectControls = function() {
    let group;
    for (let i = 1; i <= 4; i++) {
        group = "[Channel" + i + "]";
        engine.connectControl(group, "track_samples", "ReloopMixon4.deckLoaded");
        engine.connectControl(group, "play", "ReloopMixon4.ChannelPlay");
        engine.connectControl(group, "playposition", "ReloopMixon4.JogLed");
        engine.connectControl(group, "loop_end_position", "ReloopMixon4.loopDefined");
        engine.softTakeover(group, "rate", true);
        engine.setValue("[EffectRack1_EffectUnit1]", "group_" + group + "_enable", 0)
        engine.setValue("[EffectRack1_EffectUnit2]", "group_" + group + "_enable", 0)
        engine.setValue("[EffectRack1_EffectUnit3]", "group_" + group + "_enable", 0)
        channelPlaying[group] = !!engine.getValue(group, "play");
        JogBlinking[group] = false;
    }
    for (let i = 1; i <= 8; i++) {
        group = "[Sampler" + i + "]";
        engine.connectControl(group, "track_samples", "ReloopMixon4.deckLoaded");
        engine.connectControl(group, "play", "ReloopMixon4.SamplerPlay");
    }
    // Effects reset
    engine.setValue("[EffectRack1_EffectUnit1]", "group_[Master]_enable", 0);
    engine.setValue("[EffectRack1_EffectUnit2]", "group_[Master]_enable", 0);
    engine.setValue("[EffectRack1_EffectUnit3]", "group_[Master]_enable", 0);
};
ReloopMixon4.init = function(id, _debug) {
    ReloopMixon4.id = id;
    ReloopMixon4.TurnLEDsOff();
    if (engine.getValue("[App]", "num_samplers") < 8) {
        engine.setValue("[App]", "num_samplers", 8);
    }
    ReloopMixon4.connectControls(false);
    for (let i = 1; i <= 4; i++) {
        engine.trigger("[Channel" + i + "]", "loop_end_position");
    }
    //midi.sendSysexMsg(ControllerStatusSysex, ControllerStatusSysex.length);
    print("Reloop Mixon 4: " + id + " initialized.");
};
ReloopMixon4.shutdown = function() {
    ReloopMixon4.TurnLEDsOff();
    print("Reloop Mixon 4: " + ReloopMixon4.id + " shut down.");
};
ReloopMixon4.GetNextRange = function(previous) {
    const len = RateRangeArray.length;
    const pos = RateRangeArray.indexOf(previous);
    return RateRangeArray[(pos + 1) & len];
};
ReloopMixon4.Range = function(channel, control, value, status, group) {
    if (value === DOWN) {
        const oldvalue = engine.getValue(group, "rateRange");
        engine.setValue(group, "rateRange", ReloopMixon4.GetNextRange(oldvalue));
        engine.softTakeoverIgnoreNextValue(group, "rate");
    }
};
ReloopMixon4.MasterSync = function(channel, control, value, status, group) {
    if (value === DOWN) {
        script.toggleControl(group, "sync_enabled");
    }
};
ReloopMixon4.LoopSet = function(channel, control, value, status, group) {
    if (value === DOWN) {
        engine.setValue(group, "loop_in", 1);
    } else {
        engine.setValue(group, "loop_out, 1")
    }
};
ReloopMixon4.PitchSlider = function(channel, control, value, status, group) {
    engine.setValue(group, "rate", -script.midiPitch(control, value, status));
};

// Trax
ReloopMixon4.traxSelect = function(value, step) {
    switch (traxMode) {
        case 1:
            for (let i = 0; i < Math.abs(value); i++) {
                if (value < 0) {
                    engine.setValue("[Playlist]", "SelectPrevPlaylist", true);
                } else {
                    engine.setValue("[Playlist]", "SelectNextPlaylist", true);
                }
            }
            break;
        case 2:
            engine.setValue("[Playlist]", "SelectTrackKnob", value * step);
            break;
        case 3:
            engine.setValue("[PreviewDeck1]", "playposition", Math.max(0, Math.min(1, engine.getValue("[PreviewDeck1]", "playposition") + 0.02 * value * step)));
            break;
    }
}

ReloopMixon4.TraxTurn = function(channel, control, value, _status, _group) {
    ReloopMixon4.traxSelect(value - 0x40, 1);
};
ReloopMixon4.ShiftTraxTurn = function(channel, control, value, _status, _group) {
    ReloopMixon4.traxSelect(value - 0x40, 10);
};
ReloopMixon4.TraxPush = function(channel, control, value, _status, _group) {
    switch (traxMode) {
        case 1:
            engine.setValue("[Playlist]", "ToggleSelectedSidebarItem", value);
            break;
        case 2:
            engine.setValue("[PreviewDeck1]", "LoadSelectedTrackAndPlay", value);
            traxMode = 3;
            break;
        case 3:
            if (value === DOWN) {
                script.toggleControl("[PreviewDeck1]", "play");
            }
            break;
    }
};
ReloopMixon4.BackButton = function(channel, control, value, _status, _group) {
    if (value === DOWN) {
        switch (traxMode) {
            case 1:
                traxMode = 2;
                break;
            case 2:
                traxMode = 1;
                break;
            case 3:
                traxMode = 2;
                break;
        }
    }
};

ReloopMixon4.LoadButtonEject = function(group) {
    loadButtonLongPressed[group] = true;
    engine.setValue(group, "eject", 1);
    delete loadButtonTimers[group];
}
ReloopMixon4.LoadButton = function(channel, control, value, status, group) {
        if (value === DOWN) {
            loadButtonLongPressed[group] = false;
            loadButtonTimers[group] = engine.beginTimer(1000, () => { ReloopMixon4.LoadButtonEject(group); }, true)
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
    }
    // Sampler
ReloopMixon4.SamplerPad = function(channel, control, value, status, group) {
    if (value === DOWN) {
        if (engine.getValue(group, "track_samples")) {
            engine.setValue(group, "cue_gotoandplay", 1);
        } else {
            engine.setValue(group, "LoadSelectedTrack", 1);
        }
    }
}

ReloopMixon4.ShiftSamplerPad = function(channel, control, value, status, group) {
    if (value === DOWN) {
        if (engine.getValue(group, "track_samples")) {
            if (engine.getValue(group, "play")) {
                engine.setValue(group, "cue_gotoandstop", 1)
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
ReloopMixon4.SamplerVol = function(channel, control, value, status, group) {
    for (let i = 1; i < engine.getValue("[App]", "num_samplers"); i++) {
        engine.setValue("[Sampler" + i + "]", "volume", value / 127.0);
    }
}

// Jog Wheels
ReloopMixon4.WheelTouch = function(channel, control, value, status, group) {
    const deck = parseInt(group.substr(8, 1), 10);
    console.log('Deck ', deck);
    if (value === DOWN) {
        const alpha = 1.0 / 8;
        const beta = alpha / 32;
        return engine.scratchEnable(deck, 800, JogRPM, alpha, beta);
    } else {
        return engine.scratchDisable();
    }
}

ReloopMixon4.WheelTurn = function(channel, control, value, status, group) {
    const newValue = value - 64;
    const deck = parseInt(group.substr(8, 1), 10);
    if (engine.isScratching(deck)) {
        return engine.scratchTick(deck, newValue);
    } else {
        return engine.setValue(group, "jog", newValue / 5);
    }
};

// Led Feedback
ReloopMixon4.AllJogLEDsToggle = function(deck, state, step) {
    step = typeof step !== "undefined" ? step : 1;
    for (let j = 0x30; j <= 0x3F; j += step) {
        midi.sendShortMsg(deck, j, state);
    }
};

ReloopMixon4.deckLoaded = function(value, group, control) {
    let i;
    switch (group.substr(1, 7)) {
        case 'Channel':
            const channelChan = parseInt(channelRegEx.exec(group)[1]);
            if (channelChan <= 4) {
                // shut down load button
                midi.sendShortMsg(0x93 + channelChan, 0x50, value ? ON : OFF);
                if ((JogLedLit[group] !== undefined) && !value) {
                    midi.sendShortMsg(0x93 + channelChan, JogBaseLed - (JogLedLit[group] + JogLedNumber - 1) % JogLedNumber, OFF);
                    delete JogLedLit[group];
                }
            }
            break;
        case 'Sampler':
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
ReloopMixon4.SamplerPlay = function(value, group, control) {
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
ReloopMixon4.loopDefined = function(value, group, control) {
    const channelChan = parseInt(channelRegEx.exec(group)[1]);
    if (channelChan <= 4) {
        midi.sendShortMsg(0xB3 + channelChan, 0x54, value < 0 ? OFF : VIOLET);
    }
};

ReloopMixon4.ChannelPlay = function(value, group, control) {
    if (value) {
        channelPlaying[group] = true;
    } else {
        if (JogBaseLed[group]) {
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

ReloopMixon4.JogLed = function(value, group, control) {
    const trackDuration = engine.getValue(group, "duration");
    const timeLeft = trackDuration * (1.0 - value);
    const channelChan = parseInt(channelRegEx.exec(group)[1]);

    if (channelPlaying[group] && timeLeft < JogFlashWarningTime) {
        if (!JogBlinking[group]) {
            if (JogLedLit[group] !== undefined) {
                midi.sendShortMsg(0xB3 + channelChan,
                    JogBaseLed - (JogLedLit[group] + JogLedNumber - 1) % JogLedNumber, OFF);
                delete JogLedLit[group];
            }
            // Light all Jog Leds
            ReloopMixon4.AllJogLEDsToggle(0xb3 + channelChan, ON, 2);
            jogWheelTimers[group] = engine.beginTimer(
                timerLeft <= JogFlashCriticalTime ?
                JogFlashCriticalTime :
                JogFlashWarningTime,
                () => { ReloopMixon4.jogLedFlash(group, ON); }, true
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
    if (JogLedLit[group] !== undefined) {
        midi.sendShortMsg(0xB3 + channelChan,
            JogBaseLed - (ledToLight + JogLedNumber - 1) % JogLedNumber,
            OFF
        );
    }
    midi.sendShortMsg(0xB3 + channelChan,
        JogBaseLed - (ledToLight + JogLedNumber - 1) % this.JogLedNumber,
        ON
    );
    JogLedLit[group] = ledToLight;
};


ReloopMixon4.jogLedFlash = function(group, state) {
    const chan = parseInt(group.substr(1, 8), 10);
    ReloopMixon4.AllJogLEDsToggle(0xB3 + chan, state ? OFF : ON, 2);
    const timeLeft = engine.getValue(group, 'duration') * (1.0 - engine.getValue(group, "playposition"));
    if (timeLeft < JogFlashWarningTime) {
        const nextTime = (timeLeft < JogFlashCriticalTime ? JogFlashCriticalTime : JogFlashWarningTime);
        jogWheelTimers[group] = engine.beginTimer(nextTime,
            () => {
                ReloopMixon4.jogLedFlash(group, state ? OFF : ON);
            },
            true
        )
    } else {
        ReloopMixon4.AllJogLEDsToggle(0xB3 + chan, OFF);
        delete jogWheelTimers[group];
        JogBlinking[group] = false;
    }
}
