/**
 * Tdarr Plugin: Advanced Audio Tracks Transcode / Rename / Remove
 * Description: This plugin allows users to define flexible rules for transcoding, renaming or removing audio tracks based on their codec, channels, bitrate, etc.
 */

// Plugin details (metadata)
const details = () => ({
    id: 'advanced_audio_tracks_transcode_rename_remove',
    Stage: 'Pre-processing',
    Name: 'Advanced Audio Tracks Transcode / Rename / Remove',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: 'Performs "transcode", "rename" or "remove" operations on audio tracks that matches specified conditions.',
    Version: '1.0',
    Tags: 'audio only,ffmpeg,pre-processing,configurable',
    Inputs: [
        {
            name: 'transcodeRules',
            type: 'string',
            defaultValue: '',
            tooltip: `
            A JSON array of rules defining match conditions for a track, and transcode operations applied onto matching tracks.\\n
            Each track will be tested against each rule, and stop at the 1st rule matching, following the given rules order.\\n
            Once a track is matched, the operations will be applied in their given order.\\n
            If a track doesn't match any rule, it is simply copied in the output file.\\n
            ⠀\\n
            ⠀\\n
            Use tools like https://jsonformatter.org/ to easily create and modify your rules.\\n
            ⠀\\n
            ⠀\\n
            Expected JSON format: an array of objects, each of the form:\\n
            ⠀- "match" : defines the set of rules an audio track must match with to have "operations" executed upon.\\n
            ⠀- "operations" : defines the list of operations to apply to audio tracks that matches. Leaving the "operations" array empty will remove the track from the original file. 
                              Use "copy" operation to keep a copy of the original track.\\n
            ⠀- "name" : (optional) the name of the rule, used for logging and useful to keep track of what exactly a rule does.\\n
            ⠀\\n
            "match" object definition:\\n
            ⠀- "codecs" : either an array of codecs to match, or "*" for all codecs, or "!codec" (e.g., "!aac", "!eac3") for all codecs except the one listed. Usual ones are : 
                          "aac, ac3, eac3, flac, libmp3lame, libopus, truehd, libvorbis". 
                          Use the command "ffmpeg -encoders" or "ffmpeg -decoders" for a complete list of available codecs.\\n
            ⠀- "channels" : (optional) a channels selectors (e.g., "<=6", ">2", "8", etc.), or an array of channels selectors to match. Matches all channels when omitted.\\n
            ⠀- "bitrate" : (optional) a bitrate selector (e.g., "<=640000", ">128000", etc.) or an array of bitrates to match. Matches all bitrates when omitted.\\n
            ⠀- "languages" : (optional) a string or an array of languages to match (e.g., "eng", "fre", etc.) to match. Matches all languages when omitted.\\n
            ⠀- "dispositions" : (optional) an object containing ffprobe's disposition "key:value" pairs to match (e.g., {"default":"1"}, {"comment":"1","hearing_impaired":"1"}, etc.).
                                Matches only if all "key:value" pairs are met. Matches all dispositions when omitted.\\n
            ⠀- "title" : (optional) an object containing the RegExp definition to test against the track's title. Matches all titles when omitted. Expected "title" content:\\n
            ⠀    ⠀- "pattern" : the global regexp to use against the track's title to match tracks to rename. Capture groups can be used for renaming. Named capture groups are not supported.\\n
            ⠀    ⠀- "caseSensitive" : (optional) a boolean stating whether the regexp test is case sensitive. Defaults to true.\\n
            ⠀\\n
            ⠀\\n
            "operations" objects definition:\\n
            ⠀- "copy" : Set this to an object to copy the original track. /!\\ WARNING /!\\ IF YOU DO NOT COPY THE ORIGINAL TRACK, ANY ORIGINAL MATCHING TRACK WILL BE DELETED FROM THE ORIGINAL FILE /!\\\\n
            ⠀    ⠀- "title": (optional) the new track title. Retains the original track's title when omitted. Check below for the list of available tags you can use.\\n
            ⠀    ⠀- "dispositions": (optional) an object containing ffprobe's disposition "key:boolean_value" pairs to set on the copied track (e.g., {"default":false}, {"comment":true,"hearing_impaired":false}, etc.).\\n
            ⠀- "transcode" :\\n
            ⠀    ⠀- "codec": the new codec to transcode to, or "copy" to copy the original track's codec.\\n
            ⠀    ⠀- "channels": (optional) new number of channels (e.g., "6" for 5.1, "2" for stereo, etc.). Copies the original number of channels when omitted (respecting codecs limitations automatically).\\n
            ⠀    ⠀- "bitrate": (optional) new bitrate in bps. Omit if the codec is a lossless codec, or to copy the original bitrate (respecting codecs limitations automatically).\\n
            ⠀    ⠀- "title": (optional) the new track title. Retains the original track's title when omitted. Check below for the list of available tags you can use.\\n
            ⠀    ⠀- "dispositions": (optional) an object containing ffprobe's disposition "key:boolean_value" pairs to set on the transcoded track (e.g., {"default":false}, {"comment":true,"hearing_impaired":false}, etc.).\\n
            ⠀    ⠀- "filters": (optional) a string containing ffmpeg filters to apply to the track (e.g., "dynaudnorm").\\n
            ⠀\\n
            "title" available tags:\\n
            ⠀- "{1}, {2}, etc." : the capture groups of the "pattern" regexp if any were used\\n
            ⠀- "{title}" : the title of the original track\\n
            ⠀- "{lang}, {LANG}" : the language of the track, in lowercase or uppercase\\n
            ⠀- "{i_codec}, {i_CODEC}, {o_codec}, {o_CODEC}" : the name of the input (i_) or output (o_) codec, in lowercase or uppercase\\n
            ⠀- "{i_channels}, {o_channels}" : the number of input (i_) or output (o_) channels of the track\\n
            ⠀- "{i_channels_fancy}, {o_channels_fancy}" : the number of input (i_) or output (o_) channels in a fancy way ("Mono", "Stereo", or "X.1")\\n
            ⠀- "{i_channel_layout}" : the channels layout reported by ffprobe on the input track (e.g., \`5.1(side)\`)\\n
            ⠀- "{i_bitrate}, {i_bitrate_kbps}, {o_bitrate}, {o_bitrate_kbps}" : the input (i_) or output (o_) bitrate in bps or kbps\\n
            ⠀\\n
            Example JSON:\\n
            ⠀\\n
            [\\n
            ⠀⠀{\\n
            ⠀⠀⠀⠀"name": "Remove comments",\\n
            ⠀⠀⠀⠀"match": {\\n
            ⠀⠀⠀⠀⠀⠀"codecs": "*",\\n
            ⠀⠀⠀⠀⠀⠀"dispositions": {\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀"comment": "1"\\n
            ⠀⠀⠀⠀⠀⠀}\\n
            ⠀⠀⠀⠀},\\n
            ⠀⠀⠀⠀"operations": []\\n
            ⠀⠀},\\n
            ⠀⠀{\\n
            ⠀⠀⠀⠀"name": "Lossless 7.1+ to AAC 7.1+ 768kbps, before original track",\\n
            ⠀⠀⠀⠀"match": {\\n
            ⠀⠀⠀⠀⠀⠀"codecs": ["truehd","flac"],\\n
            ⠀⠀⠀⠀⠀⠀"channels": ">6"\\n
            ⠀⠀⠀⠀},\\n
            ⠀⠀⠀⠀"operations": [\\n
            ⠀⠀⠀⠀⠀⠀{\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀"transcode": {\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"codec": "aac",\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"bitrate": 768000,\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"title": "{title} {i_CODEC} -> {o_CODEC} {o_channels_fancy} {o_bitrate_kbps}kbps [Auto]",\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"dispositions": {\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"default": true,\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"comment": false\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀}\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀}\\n
            ⠀⠀⠀⠀⠀⠀},\\n
            ⠀⠀⠀⠀⠀⠀{\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀"copy": {\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"dispositions": {\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"default": false,\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"comment": false\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀}\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀}\\n
            ⠀⠀⠀⠀⠀⠀}\\n
            ⠀⠀⠀⠀]\\n
            ⠀⠀},\\n
            ⠀⠀{\\n
            ⠀⠀⠀⠀"name": "Transcode and replace E-AC3/TrueHD/FLAC 5.1 and less by an AC3 version",\\n
            ⠀⠀⠀⠀"match": {\\n
            ⠀⠀⠀⠀⠀⠀"codecs": ["eac3","truehd","flac"],\\n
            ⠀⠀⠀⠀⠀⠀"channels": "<=6",\\n
            ⠀⠀⠀⠀⠀⠀"title": {\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀"pattern": "(.*)"\\n
            ⠀⠀⠀⠀⠀⠀}\\n
            ⠀⠀⠀⠀},\\n
            ⠀⠀⠀⠀"operations": [\\n
            ⠀⠀⠀⠀⠀⠀{\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀"transcode": {\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"codec": "ac3",\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"title": "{1} {i_CODEC} {i_channels_fancy} {i_bitrate_kbps}kbps -> {o_CODEC} {o_channels_fancy} {o_bitrate_kbps}kbps [Auto]"\\n
            ⠀⠀⠀⠀⠀⠀⠀⠀}\\n
            ⠀⠀⠀⠀⠀⠀}\\n
            ⠀⠀⠀⠀]\\n
            ⠀⠀},\\n
            ⠀⠀{\\n
            ⠀⠀⠀⠀"name": "Delete all other tracks",\\n
            ⠀⠀⠀⠀"match": {\\n
            ⠀⠀⠀⠀⠀⠀"codecs": "*"\\n
            ⠀⠀⠀⠀},\\n
            ⠀⠀⠀⠀"operations": []\\n
            ⠀⠀}\\n
            ]\\n
            ⠀\\n
            ⠀1st rule: removes all commentary tracks. Matches any tracks in any codec with the disposition flag "comment" set to 1.\\n
            ⠀2nd rule: matches any track with more than 6 channels (7.1 and more) in a lossless format (TrueHD or FLAC) with an AAC 768kbps version of it, placing it before the original track, and setting it to default and not comment, 
            while setting the original track to not default and not comment, renaming it accordingly with the original title followed by a description of the transcoding characteristics.\\n
            ⠀3rd rule: matches any track in E-AC3, TrueHD or FLAC with 6 channels or less (from mono to 5.1), and replaces it with an AC3 version of it, retaining all characteristics, and renaming it accordingly with the 
            original title followed by a description of the transcoding characteristics.\\n
            ⠀4th rule: removes any track that didn't match previous rules.\\n`,
        },
        {
            name: 'dryRun',
            type: 'boolean',
            defaultValue: 'false',
            inputUI: {
                type: 'dropdown',
                options: [
                    'true',
                    'false',
                ],
            },
            tooltip: 'When set to "true", no operations will actually be applied. Use this to test your set of rules and operations before applying to your whole library.',
        },
    ],
});

// Plugin logic (functionality)
const plugin = (file, libraryOptions, inputs) => {
    const lib = require('../methods/lib')();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
    inputs = lib.loadDefaultValues(inputs, details);
    const response = {
        processFile: false, // Set to true if the file needs processing
        container: `.${file.container}`,
        handBrakeMode: false,
        FFmpegMode: true,
        infoLog: '',
    };

    // Log utility function
    function log(entry) {
        console.log(entry);
        response.infoLog += entry + "\n";
    }

    // Define limitations for specific codecs
    const codecChannelsLimits = {
        ac3: 6, // AC3 maximum channels is 6
        mp3: 2, // AC3 maximum channels is 6
    };
    const codecBitrateLimits = {
        ac3: 640000, // AC3 maximum bitrate is 640 kbps
        mp3: 320000, // MP3 maximum bitrate is 320 kbps
    };

    // Validates the transcode rules JSON
    function validateTranscodeRules(jsonString) {
        try {
            const rules = JSON.parse(jsonString);

            if (!Array.isArray(rules)) return "Expected a JSON array of rules.";

            for (let i = 0; i < rules.length; i++) {
                const rule = rules[i];

                if (typeof rule !== 'object' || rule === null) return `Rule at index ${i} is not an object.`;
                if (!rule.hasOwnProperty('match') || !rule.hasOwnProperty('operations')) return `Rule at index ${i} is missing 'match' or 'operations' property.`;

                const match = rule.match;
                if (typeof match !== 'object' || match === null) return `Match property in rule at index ${i} is not an object.`;
                if (!match.hasOwnProperty('codecs')) return `Match property in rule at index ${i} is missing 'codecs' property.`;
                if (!Array.isArray(match.codecs) && match.codecs !== '*' && !match.codecs.startsWith('!')) return `'codecs' property in rule at index ${i} must be an array, '*', or '!codec'.`;

                if (match.hasOwnProperty('channels') && typeof match.channels !== 'string' && !Array.isArray(match.channels)) return `'channels' property in rule at index ${i} must be a string or an array.`;
                if (match.hasOwnProperty('bitrate') && typeof match.bitrate !== 'string' && !Array.isArray(match.bitrate)) return `'bitrate' property in rule at index ${i} must be a string or an array.`;
                if (match.hasOwnProperty('languages') && typeof match.languages !== 'string' && !Array.isArray(match.languages)) return `'languages' property in rule at index ${i} must be a string or an array.`;
                if (match.hasOwnProperty('dispositions') && (typeof match.dispositions !== 'object' || match.dispositions === null)) return `'dispositions' property in rule at index ${i} must be an object.`;

                if (match.hasOwnProperty('title')) {
                    if (typeof match.title !== 'object' || match.title === null) return `'title' property in rule at index ${i} must be an object.`;
                    if (!match.title.hasOwnProperty('pattern')) return `'title' property in rule at index ${i} is missing 'pattern' property.`;
                    if (typeof match.title.pattern !== 'string') return `'pattern' property in rule at index ${i} must be a string.`;
                    if (match.title.hasOwnProperty('caseSensitive') && typeof match.title.caseSensitive !== 'boolean') return `'caseSensitive' property in rule at index ${i} must be a boolean.`;
                    match.title.pattern = match.title.pattern.replaceAll("\\\\", "\\");
                }

                const operations = rule.operations;
                if (!Array.isArray(operations)) return `Operations property in rule at index ${i} must be an array.`;

                for (let j = 0; j < operations.length; j++) {
                    const operation = operations[j];

                    if (typeof operation !== 'object' || operation === null) return `Operation at index ${j} in rule at index ${i} is not an object.`;

                    if (operation.hasOwnProperty('copy')) {
                        if (typeof operation.copy !== 'object' || operation.copy === null) return `'copy' operation at index ${j} in rule at index ${i} must be an object.`;
                        if (operation.copy.hasOwnProperty('title') && typeof operation.copy.title !== 'string') return `'title' property in 'copy' operation at index ${j} in rule at index ${i} must be a string.`;
                        if (operation.copy.hasOwnProperty('dispositions')) {
                            if(typeof operation.copy.dispositions !== 'object' || operation.copy.dispositions === null) return `'dispositions' property in 'copy' operation at index ${j} in rule at index ${i} must be an object.`;
                            for(let flag in operation.copy.dispositions) { if(typeof operation.copy.dispositions[flag] !== 'boolean')
                                return `'${flag}' property in 'dispositions' object in 'copy' operation at index ${j} rule at index ${i} must be a boolean.`;
                            }
                        }

                    } else if (operation.hasOwnProperty('transcode')) {
                        if (typeof operation.transcode !== 'object' || operation.transcode === null) return `'transcode' operation at index ${j} in rule at index ${i} must be an object.`;
                        if (!operation.transcode.hasOwnProperty('codec')) return `'transcode' operation at index ${j} in rule at index ${i} is missing 'codec' property.`;
                        if (typeof operation.transcode.codec !== 'string') return `'codec' property in 'transcode' operation at index ${j} in rule at index ${i} must be a string.`;
                        if (operation.transcode.hasOwnProperty('channels') && typeof operation.transcode.channels !== 'number') return `'channels' property in 'transcode' operation at index ${j} in rule at index ${i} must be a number.`;
                        if (operation.transcode.hasOwnProperty('bitrate') && typeof operation.transcode.bitrate !== 'number') return `'bitrate' property in 'transcode' operation at index ${j} in rule at index ${i} must be a number.`;
                        if (operation.transcode.hasOwnProperty('title') && typeof operation.transcode.title !== 'string') return `'title' property in 'transcode' operation at index ${j} in rule at index ${i} must be a string.`;
                        if (operation.transcode.hasOwnProperty('dispositions')) {
                            if(typeof operation.transcode.dispositions !== 'object' || operation.transcode.dispositions === null) return `'dispositions' property in 'transcode' operation at index ${j} in rule at index ${i} must be an object.`;
                            for(let flag in operation.transcode.dispositions) { if(typeof operation.transcode.dispositions[flag] !== 'boolean')
                                return `'${flag}' property in 'dispositions' object in 'transcode' operation at index ${j} rule at index ${i} must be a boolean.`;
                            }
                        }
                        if (operation.transcode.hasOwnProperty('filters') && typeof operation.transcode.filters !== 'string') return `'filters' property in 'transcode' operation at index ${j} in rule at index ${i} must be a string.`;
                    } else {
                        return `Operation at index ${j} in rule at index ${i} must have either 'copy' or 'transcode' property.`;
                    }
                }
            }

            // If everything is valid, return the parsed rules object
            return rules;
        } catch (e) {
            return `Invalid JSON: ${e.message}`;
        }
    }

    // Checks the given int value against a string condition
    function matchesIntCondition (value, condition) {
        if (condition.startsWith("<=")) return value <= parseInt(condition.slice(2));
        if (condition.startsWith(">=")) return value >= parseInt(condition.slice(2));
        if (condition.startsWith("<")) return value < parseInt(condition.slice(1));
        if (condition.startsWith(">")) return value > parseInt(condition.slice(1));
        return value === parseInt(condition);
    }

    // Tests a given track data against the given selectors
    function trackMatches(trackData, matchRule) {
        if( (Array.isArray(matchRule.codecs) && !matchRule.codecs.includes(trackData.codec_name.toLowerCase())) ||
            (!Array.isArray(matchRule.codecs) && matchRule.codecs !== '*' && trackData.codec_name.toLowerCase() === matchRule.codecs.slice(1).toLowerCase()) ) return false;

        if(matchRule.channels) {
            const channelsRules = Array.isArray(matchRule.channels) ? matchRule.channels : [matchRule.channels];
            for(let channels of channelsRules)
                if(!matchesIntCondition(trackData.channels, channels)) return false;
        }

        if(matchRule.bitrate) {
            const bitrateRules = Array.isArray(matchRule.bitrate) ? matchRule.bitrate : [matchRule.bitrate];
            for(let bitrate of bitrateRules)
                if(!matchesIntCondition(trackData.bit_rate, bitrate)) return false;
        }

        if(matchRule.languages) {
            const languages = Array.isArray(matchRule.languages) ? matchRule.languages : [matchRule.languages];
            const trackLanguage = trackData.tags && trackData.tags.language ? trackData.tags.language : 'und';
            if (!languages.includes(trackLanguage)) return false;
        }

        if(matchRule.dispositions && !Object.entries(matchRule.dispositions).every(([key, value]) => key in trackData.disposition && trackData.disposition[key] === value)) return false;

        if(matchRule.title) {
            const trackTitle = (trackData.tags && trackData.tags.title ? trackData.tags.title : '');
            const patternRegExp = matchRule.title.caseSensitive && matchRule.title.caseSensitive ? new RegExp(matchRule.title.pattern) : new RegExp(matchRule.title.pattern, "i");
            if(!patternRegExp.test(trackTitle)) return false;
        }

        return true;
    }

    // Returns a fancy channel name from the channels count
    function getFancyChannels(channelsCount) {
        const channels = parseInt(channelsCount);
        if(channels === 1) return "Mono";
        if(channels === 2) return "Stereo";
        return `${channels - 1}.1`;
    }

    // Returns the track's title based on the given rule
    function getNewTrackTitle(track, matchTitle, operation, bitrate) {
        const trackTitle = (track.tags && track.tags.title ? track.tags.title : '');
        let newTrackTitle = operation.title + "";

        function updateTrackTitle(find, replaceWith) {
            newTrackTitle = newTrackTitle.replaceAll(find, replaceWith);
        }

        // Capture groups:
        if(matchTitle) {
            const patternRegExp = new RegExp(matchTitle.pattern, matchTitle.caseSensitive ? "g" : "gi");
            for (const match of trackTitle.matchAll(patternRegExp)) {
                match.slice(1).forEach((group, index) => {
                    updateTrackTitle("{" + (index + 1) + "}", group);
                });
            }
        }

        // Title:
        updateTrackTitle("{title}", trackTitle);

        // Languages:
        const trackLanguage = track.tags && track.tags.language ? track.tags.language : 'und';
        updateTrackTitle("{lang}", trackLanguage.toLowerCase());
        updateTrackTitle("{LANG}", trackLanguage.toUpperCase());

        // Codec:
        updateTrackTitle("{i_codec}", track.codec_name.toLowerCase());
        updateTrackTitle("{i_CODEC}", track.codec_name.toUpperCase());

        const codecName = operation.codec && operation.codec !== "copy" ? operation.codec : track.codec_name;
        updateTrackTitle("{o_codec}", codecName.toLowerCase());
        updateTrackTitle("{o_CODEC}", codecName.toUpperCase());

        // Channels:
        updateTrackTitle("{i_channels}", track.channels);
        updateTrackTitle("{i_channels_fancy}", getFancyChannels(track.channels));
        updateTrackTitle("{i_channel_layout}", track.channel_layout);
        const outputChannels = operation.channels ? operation.channels : track.channels;
        updateTrackTitle("{o_channels}", outputChannels);
        updateTrackTitle("{o_channels_fancy}", getFancyChannels(outputChannels));

        // Bitrate:
        if (track.bit_rate) {
            updateTrackTitle("{i_bitrate}", track.bit_rate);
            updateTrackTitle("{i_bitrate_kbps}", (parseInt(track.bit_rate) / 1000).toString());
        }
        if(bitrate) {
            updateTrackTitle("{o_bitrate}", bitrate);
            updateTrackTitle("{o_bitrate_kbps}", (parseInt(bitrate) / 1000).toString());
        }

        // Replace special characters that can make the command fail:
        newTrackTitle = newTrackTitle.replaceAll(',', '‚'); // -> replace with a unicode SINGLE LOW-9 QUOTATION MARK
        newTrackTitle = newTrackTitle.replaceAll('"', '″'); // -> replace with a unicode DOUBLE PRIME

        return newTrackTitle;
    }

    // Returns the FFMpeg command flags from the given disposition's object
    function getDispositionFlags(dispositions) {
        const flags = [];
        let isFirstFlag = true;
        for (const [flag, value] of Object.entries(dispositions)) {
            flags.push(value === true ? (isFirstFlag? flag : '+' + flag) : '-' + flag);
            isFirstFlag = false;
        }
        return flags.join('');
    }


    // --------------------------------------------------- MAIN --------------------------------------------------- //


    log(`--- Starting Advanced Audio Tracks Transcode / Rename / Remove plugin on ${file.file} ...`);

    // Parse the transcode rules from the input
    const transcodeRules = validateTranscodeRules(inputs.transcodeRules);
    if (typeof transcodeRules === 'string') {
        log(`Invalid transcodeRules JSON: ${transcodeRules}`);
        return response;
    }

    const dryRun = inputs.dryRun === 'true';

    const pluginWatermark = `[Tdarr:advanced_audio_transcode_rename_remove:${btoa(JSON.stringify(transcodeRules))}]`;

    // Check if the file is valid for processing
    log("Checking for ffProbeData...");
    if (!file.ffProbeData || !file.ffProbeData.streams) {
        log('Invalid file for processing, FFProbe data missing');
        return response;
    }

    // Check plugin didn't process the file already
    const copyrightData = file.ffProbeData.format && file.ffProbeData.format.tags && file.ffProbeData.format.tags.COPYRIGHT || '';
    if (copyrightData.includes(pluginWatermark)) {
        log('Plugin watermark found -> file already processed. Aborting.');
        return response;
    }

    // Extract audio tracks data
    log("FFProbeData present, extracting audio tracks data...");
    const audioTracks = file.ffProbeData.streams.filter(stream => stream.codec_type === 'audio');
    if (audioTracks.length === 0) {
        log('No audio tracks, nothing to do');
        return response;
    }
    log(audioTracks.length + " audio tracks");

    // Check each audio track
    const audioTracksCommands = [];
    let inputTrackIndex = 0;
    let outputTrackIndex = 0;
    let requireTranscode = false;

    audioTracks.forEach(track => {

        // Test the track against each rule
        let ruleMatched = false;
        const trackTitle = (track.tags && track.tags.title ? track.tags.title : '');

        transcodeRules.forEach(rule => {
            if(ruleMatched) return;
            if(!trackMatches(track, rule.match)) return;

            ruleMatched = true;
            log(`Track ${track.index} (title: "${trackTitle}") matches rule "${rule.name ? rule.name : JSON.stringify(rule.match)}", applying operations ...`);

            if(rule.operations.length === 0) {
                log(" -> Removing track");
            }
            else {
                // Apply operations
                rule.operations.forEach(operation => {
                    let logEntry = ' -> ';

                    // Copy a track:
                    if(operation.copy) {
                        logEntry += 'Copying track';
                        audioTracksCommands.push(`-map 0:a:${inputTrackIndex} -c:a:${outputTrackIndex} copy`);
                        if(operation.copy.title) {
                            const newTrackTitle = getNewTrackTitle(track, rule.match.title, operation.copy, track.bit_rate);
                            logEntry += `, renaming it to "${newTrackTitle}"`;
                            audioTracksCommands.push(`-metadata:s:a:${outputTrackIndex} "title=${newTrackTitle}"`);
                        }
                        if(operation.copy.dispositions) {
                            const dispositionsFlags = getDispositionFlags(operation.copy.dispositions);
                            logEntry += `, dispositions ${dispositionsFlags}`;
                            audioTracksCommands.push(`-disposition:a:${outputTrackIndex} ${dispositionsFlags}`);
                        }
                    }

                    // Transcode a track:
                    else if(operation.transcode) {
                        logEntry += 'Transcoding to ';
                        audioTracksCommands.push(`-map 0:a:${inputTrackIndex}`); // Map the original audio track

                        // Set new codec
                        const targetCodec = operation.transcode.codec === "copy" ? track.codec_name : operation.transcode.codec;
                        audioTracksCommands.push(`-c:a:${outputTrackIndex} ${targetCodec}`); // Set the new track's target codec
                        logEntry += targetCodec.toUpperCase();

                        // Set channels if needed
                        let channels = operation.transcode.channels ? operation.transcode.channels : track.channels;
                        let forceChannels = false;

                        // Safety: Force 8 channels if target is AAC and source is >6ch with no user override.
                        // This prevents crashes on exotic layouts (e.g. Atmos TFL/TFR) by forcing a standard 7.1 layout mapping.
                        if (targetCodec.toLowerCase() === 'aac' && track.channels > 6 && !operation.transcode.channels) {
                            logEntry += ` (forcing 8 channels for AAC, to avoid exotic layouts issues with AAC encoder)`;
                            forceChannels = true;
                            channels = 8;
                        }

                        if(operation.transcode.channels || channels !== track.channels || (codecChannelsLimits[targetCodec] && channels > codecChannelsLimits[targetCodec]) ||forceChannels) {
                            if(codecChannelsLimits[targetCodec] && channels > codecChannelsLimits[targetCodec])
                                channels = codecChannelsLimits[targetCodec];
                            audioTracksCommands.push(`-ac:a:${outputTrackIndex} ${channels}`);
                            logEntry += ` ${channels}ch`;
                        }

                        // Set bitrate if needed
                        let bitrate = operation.transcode.bitrate ? operation.transcode.bitrate : track.bit_rate;
                        if(operation.transcode.bitrate) {
                            if (codecBitrateLimits[targetCodec] && bitrate > codecBitrateLimits[targetCodec])
                                bitrate = codecBitrateLimits[targetCodec];
                            audioTracksCommands.push(`-b:a:${outputTrackIndex} ${bitrate}`); // Set bitrate
                            logEntry += ` ${bitrate}bps`;
                        }

                        // Set track's title
                        if(operation.transcode.title) {
                            const newTrackTitle = getNewTrackTitle(track, rule.match.title, operation.transcode, bitrate);
                            audioTracksCommands.push(`-metadata:s:a:${outputTrackIndex} "title=${newTrackTitle}"`); // Set track title
                            logEntry += ` renamed to "${newTrackTitle}"`;
                        }

                        // Set track's new dispositions
                        if(operation.transcode.dispositions) {
                            const dispositionsFlags = getDispositionFlags(operation.transcode.dispositions);
                            logEntry += `, dispositions ${dispositionsFlags}`;
                            audioTracksCommands.push(`-disposition:a:${outputTrackIndex} ${dispositionsFlags}`);
                        }

                        // Set track's filters
                        if(operation.transcode.filters) {
                            logEntry += `, filters "${operation.transcode.filters}"`;
                            audioTracksCommands.push(`-filter:a:${outputTrackIndex} "${operation.transcode.filters}"`);
                        }
                    }

                    log(logEntry);
                    outputTrackIndex++;
                    requireTranscode = true;
                });
            }
        });

        if(!ruleMatched) {
            log(`Track ${track.index} (title: "${trackTitle}") didn't match any rule, copying track`);
            audioTracksCommands.push(`-map 0:a:${inputTrackIndex} -c:a:${outputTrackIndex} copy`);
            outputTrackIndex++;
        }

        inputTrackIndex++;
    });

    // If any transcoding is required, build the ffmpeg command
    if (requireTranscode) {
        response.processFile = true;

        // --- FIX FOR UNSUPPORTED SUBTITLES ---
        // We only map subtitle streams that have a valid codec name identified by FFprobe.
        const subtitleStreams = file.ffProbeData.streams.filter(s => s.codec_type === 'subtitle');
        let subtitleCommands = '';

        subtitleStreams.forEach((s, idx) => {
            if (s.codec_name && s.codec_name !== 'none') {
                subtitleCommands += `-map 0:s:${idx} -c:s:${idx} copy `;
            } else {
                log(` -> Subtitle track ${s.index}: Missing codec name. Skipping to prevent crash.`);
            }
        });

        if (subtitleCommands === '') { subtitleCommands = '-sn '; }
        // ----------------------------------------

        response.preset = ',' +
            '-map 0:v -c:v copy ' + // Copy video stream without re-encoding
            audioTracksCommands.join(' ') + ' ' + // Add audio tracks
            subtitleCommands + // Add subtitles
            '-metadata "copyright=' + copyrightData + pluginWatermark + '"'; // Add plugin watermark
    } else {
        log("Nothing to convert.");
    }

    // DRY RUN
    if(dryRun) {
        log("DRY RUN MODE, no action will be performed");
        log("Resulting ffmpeg command :\n" + response.preset);
        response.preset = '';
        response.processFile = false;
    }

    return response;
};

// Export the plugin (details and functionality)
module.exports.details = details;
module.exports.plugin = plugin;
