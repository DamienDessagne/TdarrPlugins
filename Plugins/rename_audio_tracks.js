/**
 * Tdarr Plugin: Rename Audio Tracks
 * Description: Renames audio tracks using many selection criteria and regexp
 */

// Plugin details (metadata)
const details = () => ({
    id: 'rename_audio_tracks',
    Stage: 'Pre-processing',
    Name: 'Rename Audio Tracks',
    Type: 'Audio',
    Operation: 'Transcode',
    Description: 'Renames audio tracks using many selection criteria and regexp.',
    Version: '1.0',
    Tags: 'action,audio',
    Inputs: [
        {
            name: 'codecs',
            type: 'string',
            defaultValue: '*',
            tooltip: 'A semicolon separated list of codecs (e.g., `eac3,truehd`, `aac`, etc.) to match, or `*` for all codecs. Use the command `ffmpeg -encoders` or `ffmpeg -decoders` for a list of codecs',
        },
        {
            name: 'channels',
            type: 'string',
            defaultValue: '*',
            tooltip: 'A channels selectors (e.g., `<=6`, `>2`, `8`, etc.) to match, or `*` for all channels.',
        },
        {
            name: 'bitrate',
            type: 'string',
            defaultValue: '*',
            tooltip: 'A bitrate selector (e.g., `<=640000`, `>128000`, etc.) to match, or `*` for all bitrates.',
        },
        {
            name: 'languages',
            type: 'string',
            defaultValue: '*',
            tooltip: 'A semicolon separated list of language selectors (e.g., `eng`, `eng;fre`, etc.) to match, or `*` for all languages.',
        },
        {
            name: 'dispositions',
            type: 'string',
            defaultValue: '',
            tooltip: 'A semicolon separated list of ffprobe\'s disposition `key:value` pairs to match (e.g., `default:1`, `comment:1;hearing_impaired:1`, etc.). Matches only if all `key:value` pairs are met.',
        },
        {
            name: 'pattern',
            type: 'string',
            defaultValue: '(.*)',
            tooltip: 'The global regexp to use against the track\'s title to match tracks to rename. Capture groups can be used for renaming. Named capture groups are not supported.',
        },
        {
            name: 'caseSensitive',
            type: 'boolean',
            defaultValue: 'true',
            inputUI: {
                type: 'dropdown',
                options: [
                    'true',
                    'false',
                ],
            },
            tooltip: 'Whether the search regexp is case sensitive.',
        },
        {
            name: 'renameTo',
            type: 'string',
            defaultValue: '{1} - {LANG} {CODEC} {channel_layout} {bitrate_kbps}kbps',
            tooltip: 'The pattern used to rename the track to. Here are the available tags you can use :\\n' +
                ' - `{1}, {2}, etc.`: the capture groups of the `pattern` regexp\\n' +
                ' - `{lang}, {LANG}`: the language of the track, in lowercase or uppercase\\n' +
                ' - `{codec}, {CODEC}`: the name of the codec, in lowercase or uppercase\\n' +
                ' - `{channels}`: the number of channels\\n' +
                ' - `{channels_fancy}`: the number of channels in a fancy way (`Mono`, `Stereo`, or `X.1`)\\n' +
                ' - `{channel_layout}`: the channels layout reported by ffprobe (e.g., `5.1(side)`)\\n' +
                ' - `{bitrate}, {bitrate_kbps}`: the bitrate in bps or kbps',
        },
    ],
});

// Plugin logic (functionality)
const plugin = (file, libraryOptions, inputs) => {
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

    function matchesIntCondition (value, condition) {
        if (condition === "*") return true;
        if (condition.startsWith("<=")) return value <= parseInt(condition.slice(2));
        if (condition.startsWith(">=")) return value >= parseInt(condition.slice(2));
        if (condition.startsWith("<")) return value < parseInt(condition.slice(1));
        if (condition.startsWith(">")) return value > parseInt(condition.slice(1));
        return value === parseInt(condition);
    }

    // Tests a given track data against the given selectors
    function trackMatches(trackData, codecs, channels, bitrate, languages, dispositions, pattern, caseSensitive) {
        if(!codecs.includes('*') && !codecs.includes(trackData.codec_name.toLowerCase())) return false;
        if(!matchesIntCondition(trackData.channels, channels)) return false;
        if(!matchesIntCondition(trackData.bit_rate, bitrate)) return false;
        if(!languages.includes('*')) {
            const trackLanguage = trackData.tags && trackData.tags.language ? trackData.tags.language : 'und';
            if (!languages.includes(trackLanguage)) return false;
        }
        if(!Object.entries(dispositions).every(([key, value]) => key in trackData.disposition && trackData.disposition[key] === value)) return false;

        const trackTitle = (trackData.tags && trackData.tags.title ? trackData.tags.title : '');
        const patternRegExp = caseSensitive ? new RegExp(pattern) : new RegExp(pattern, "i");
        return patternRegExp.test(trackTitle);
    }

    // Returns a fancy channel name from the channels count
    function getFancyChannels(channelsCount) {
        const channels = parseInt(channelsCount);
        if(channels === 1) return "Mono";
        if(channels === 2) return "Stereo";
        return `${channels - 1}.1`;
    }


    // --------------------------------------------------- MAIN --------------------------------------------------- //


    log(`--- Starting Rename Audio Tracks plugin on ${file.file} ...`);


    // Retrieve the inputs' data:
    const codecs = inputs.codecs.split(';').map(c => c.trim().toLowerCase());
    const channels = inputs.channels.trim();
    const bitrate = inputs.bitrate.trim();
    const languages = inputs.languages.split(';').map(l => l.trim());
    const dispositions = inputs.dispositions ? Object.fromEntries(inputs.dispositions.split(";").map(pair => { const [key, value] = pair.split(":"); return [key.trim(), isNaN(value) ? value.trim() : Number(value)]; })) : {};
    const pattern = inputs.pattern;
    const caseSensitive = inputs.caseSensitive === 'true';
    const renameTo = inputs.renameTo;

    const pluginWatermark = "[Tdarr:rename_audio_tracks:" +
        btoa(`${details().Version}:${codecs.join('|')}:${channels}:${bitrate}:${languages.join('|')}:${inputs.dispositions}:${pattern}:${caseSensitive?"g":"gi"}:${renameTo})`) +
        "]";

    // Check if the file is valid for processing
    log("Checking for ffProbeData...");
    if (!file.ffProbeData || !file.ffProbeData.streams) {
        log('Invalid file for processing, FFProbe data missing');
        return response;
    }

    // Check plugin didn't process the file already
    let copyrightData = file.ffProbeData.format && file.ffProbeData.format.tags && file.ffProbeData.format.tags.COPYRIGHT || '';
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
    let audioTrackIndex = -1;

    audioTracks.forEach((track) => {
        audioTrackIndex += 1;

        // Test track against all selection criteria:
        if (trackMatches(track, codecs, channels, bitrate, languages, dispositions, pattern, caseSensitive)) {
            log(`Track ${audioTrackIndex} matches the selector, renaming ...`);

            const trackTitle = (track.tags && track.tags.title ? track.tags.title : '');
            const patternRegExp = new RegExp(pattern, caseSensitive ? "g" : "gi");

            let newTrackTitle = renameTo;

            function updateTrackTitle(find, replaceWith) {
                newTrackTitle = newTrackTitle.replaceAll(find, replaceWith);
            }

            // Capture groups:
            for (const match of trackTitle.matchAll(patternRegExp)) {
                match.slice(1).forEach((group, index) => {
                    updateTrackTitle("{" + (index + 1) + "}", group);
                });
            }

            // Languages:
            const trackLanguage = track.tags && track.tags.language ? track.tags.language : 'und';
            updateTrackTitle("{lang}", trackLanguage.toLowerCase());
            updateTrackTitle("{LANG}", trackLanguage.toUpperCase());

            // Codec:
            updateTrackTitle("{codec}", track.codec_name.toLowerCase());
            updateTrackTitle("{CODEC}", track.codec_name.toUpperCase());

            // Channels:
            updateTrackTitle("{channels}", track.channels);
            updateTrackTitle("{channels_fancy}", getFancyChannels(track.channels));
            updateTrackTitle("{channel_layout}", track.channel_layout);

            // Bitrate:
            if (track.bit_rate) {
                updateTrackTitle("{bitrate}", track.bit_rate);
                updateTrackTitle("{bitrate_kbps}", parseInt(track.bit_rate) / 1000);
            }

            // Rename track
            log(` -> renaming from: '${trackTitle}' to '${newTrackTitle}'`);
            response.processFile = true;
            audioTracksCommands.push(`-metadata:s:a:${audioTrackIndex} "title=${newTrackTitle}"`); // Set track title
        }

        // Track doesn't match
        else {
            log("Track doesn't match, skipping");
        }
    });

    // If audio tracks were renamed, build the ffmpeg command
    if (response.processFile) {
        response.preset = ',' +
            '-map 0 -c copy ' + // Copy all streams without re-encoding
            audioTracksCommands.join(' ') + ' ' + // Add audio tracks renaming
            '-metadata "copyright=' + copyrightData + pluginWatermark + '"'; // Add plugin watermark
    } else {
        log("Nothing to do.");
    }

    return response;
};

// Export the plugin (details and functionality)
module.exports.details = details;
module.exports.plugin = plugin;