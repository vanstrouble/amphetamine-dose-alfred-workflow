#!/usr/bin/env osascript -l JavaScript

// JXA implementation of ams_filter functionality
// Migrated from zsh to improve performance and maintainability for the Alfred workflow.
// Inspired by cfs_filter.js

ObjC.import("Foundation");
ObjC.import("stdlib");

// --- Globals ---

// Alfred preferences
const TIME_FORMAT = $.getenv("alfred_time_format") || "0"; // "0" = 12-hour, "1" = 24-hour
const DISPLAY_SLEEP_ALLOW = $.getenv("display_sleep_allow") === "true";

// --- Amphetamine Interaction ---

function getAmphetamineApp() {
    try {
        return Application("Amphetamine");
    } catch (e) {
        return null;
    }
}

function checkStatus() {
    const amp = getAmphetamineApp();
    if (!amp || !amp.running()) {
        return "Amphetamine not running|Run a command to start a session|false";
    }

    try {
        const timeRemaining = amp.sessionTimeRemaining();
        const displaySleepAllowed = amp.displaySleepAllowed();
        const displaySleepInfo = displaySleepAllowed ? " - Display can sleep" : " - Display stays awake";

        if (timeRemaining === -3) { // No active session
            return "Amphetamine deactivated|Run a command to start a session|false";
        }

        if (timeRemaining === 0) { // Indefinite session
            return `Amphetamine active indefinitely|Session running indefinitely${displaySleepInfo}|false`;
        }

        if (timeRemaining > 0) { // Timed session
            const endDate = new Date(Date.now() + timeRemaining * 1000);
            const endTimeStr = formatTime(endDate);
            const title = `Amphetamine active until ${endTimeStr}`;
            const subtitle = formatRemainingTime(timeRemaining, displaySleepInfo);
            const needsRerun = timeRemaining <= 3600;
            return `${title}|${subtitle}|${needsRerun}`;
        }

        return "Amphetamine deactivated|Run a command to start a session|false";

    } catch (error) {
        // This can happen if Amphetamine is quitting or in a weird state.
        return "Amphetamine not responding|Could not get session status|false";
    }
}


// --- Time & Formatting Helpers (from cfs_filter.js) ---

function convertTo24hFormat(hour, ampm) {
	hour = parseInt(hour) || 0;
	if (/[pP]/.test(ampm) && hour < 12) return hour + 12;
	if (/[aA]/.test(ampm) && hour === 12) return 0;
	return hour;
}

function calculateFutureTime(totalMinutes, currentHour, currentMinute) {
	const futureTotal = currentHour * 60 + currentMinute + totalMinutes;
	const futureHour = Math.floor(futureTotal / 60) % 24;
	const futureMinute = futureTotal % 60;
	return `TIME:${String(futureHour).padStart(2, '0')}:${String(futureMinute).padStart(2, '0')}`;
}

function formatTime(dateOrTimestamp, includeSeconds = false) {
	const date = typeof dateOrTimestamp === "number" ? new Date(dateOrTimestamp) : dateOrTimestamp;
	const formatter = $.NSDateFormatter.alloc.init;
	formatter.setDateFormat(TIME_FORMAT === "0"
		? (includeSeconds ? "h:mm:ss a" : "h:mm a")
		: (includeSeconds ? "HH:mm:ss" : "HH:mm"));
	return formatter.stringFromDate(date).js.replace(/^\s+/, "");
}

function calculateEndTime(minutes) {
	return formatTime(Date.now() + minutes * 60000, true);
}

function getNearestFutureTime(hour, minute, currentHour, currentMinute) {
	const currentTotal = currentHour * 60 + currentMinute;
	const amHour = hour === 12 ? 0 : hour;
	const pmHour = hour < 12 ? hour + 12 : hour;
	const amDiff = amHour * 60 + minute - currentTotal;
	const pmDiff = pmHour * 60 + minute - currentTotal;

    // If AM is in the past and PM is in the future, use PM.
	if (amDiff < 0 && pmDiff >= 0) return pmDiff;
    // If both are in the future, use the sooner one (AM).
	if (amDiff >= 0 && pmDiff >= 0) return amDiff;
    // If both are in the past, use the one for the next day (AM).
	return amDiff + 1440; // 1440 minutes in a day
}

function formatDuration(totalMinutes) {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	const hText = hours === 1 ? "1 hour" : `${hours} hours`;
	const mText = minutes === 1 ? "1 minute" : `${minutes} minutes`;
	if (hours > 0 && minutes > 0) return `${hText} ${mText}`;
	if (hours > 0) return hText;
	return mText;
}

function formatRemainingTime(remainingSeconds, displaySleepInfo) {
	if (remainingSeconds < 60) return `${remainingSeconds}s left${displaySleepInfo}`;
	if (remainingSeconds < 3600) {
		const m = Math.floor(remainingSeconds / 60);
		const s = remainingSeconds % 60;
		return `${m}m${s > 0 ? ` ${s}s` : ''} left${displaySleepInfo}`;
	}
	const h = Math.floor(remainingSeconds / 3600);
	const m = Math.floor((remainingSeconds % 3600) / 60);
	return `${h}h${m > 0 ? ` ${m}m` : ''} left${displaySleepInfo}`;
}


// --- Input Parsing ---

function parseTimeInput(hour, minute = 0, ampm = "") {
	const now = new Date();
	const currentHour = now.getHours();
	const currentMinute = now.getMinutes();

	if (ampm) {
		const convertedHour = convertTo24hFormat(hour, ampm);
		return `TIME:${String(convertedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
	}
	const totalMinutes = getNearestFutureTime(hour, minute, currentHour, currentMinute);
    // If the input was just an hour (e.g., "8"), return total minutes.
    // If it was hour and minute (e.g., "8:30"), return a TIME string.
	return minute > 0 ? calculateFutureTime(totalMinutes, currentHour, currentMinute) : String(totalMinutes);
}

function parseInput(input) {
	if (!input || input.trim() === "") return "simple_status";

	const parts = input.trim().split(/\s+/);

    // `ams d` -> deactivate
    if (parts[0] === "d") return "deactivate";

	if (parts.length === 2) {
		const hours = parseInt(parts[0]);
		const minutes = parseInt(parts[1]);
		if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && minutes >= 0) {
			return String(hours * 60 + minutes);
		}
		return "0"; // Invalid two-part input
	}

	if (parts.length === 1) {
		const part = parts[0];
		if (part === "s") return "status";
		if (part === "i") return "indefinite";
		if (part === "d") return "deactivate"; // Also support `ams d`
		if (/^\d+$/.test(part)) return part; // Just minutes

		if (part.endsWith("h") && part.length > 1) {
			const hours = parseInt(part.slice(0, -1));
			if (!isNaN(hours) && hours >= 0) return String(hours * 60);
		}

		if (part.includes(":")) return parseTimeFormat(part);

        // Regex to catch 8a, 8am, 8p, 8pm
		const ampmMatch = part.match(/^(\d{1,2})((?:a|p)m?)$/i);
		if (ampmMatch) {
			return parseAMPMFormat(part);
		}

		const hour = parseInt(part);
		if (!isNaN(hour) && hour >= 0 && hour <= 23) return parseTimeInput(hour);
		return "0";
	}
	return "0"; // Default to invalid for other cases
}

function parseTimeFormat(part) {
	const colonIndex = part.indexOf(":");

    // Case: "8:" (hour only)
	if (colonIndex === part.length - 1) {
		const hour = parseInt(part.slice(0, -1));
		if (!isNaN(hour) && hour >= 0 && hour <= 23) {
			const now = new Date();
			const totalMinutes = getNearestFutureTime(hour, 0, now.getHours(), now.getMinutes());
			const futureTime = calculateFutureTime(totalMinutes, now.getHours(), now.getMinutes());
			return futureTime.replace(/:(\d+)$/, ":00"); // Ensure it's on the hour
		}
		return "0";
	}

    // Case: "8:30", "8:30a", "8:30pm"
	const timeParts = part.split(":");
	if (timeParts.length !== 2) return "0";

	let minutePart = timeParts[1];
	let ampm = "";
	const ampmMatch = minutePart.match(/(\d{1,2})((?:a|p)m?)$/i);

	if (ampmMatch) {
		minutePart = ampmMatch[1];
		ampm = ampmMatch[2].charAt(0);
	}

	const hour = parseInt(timeParts[0]);
	const minute = parseInt(minutePart);
	if (!isNaN(hour) && !isNaN(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
		return parseTimeInput(hour, minute, ampm);
	}
	return "0";
}

function parseAMPMFormat(part) {
	const lower = part.toLowerCase();
	let hour, ampm;

	if (lower.endsWith("am")) {
		hour = parseInt(part.slice(0, -2));
		ampm = "a";
	} else if (lower.endsWith("pm")) {
		hour = parseInt(part.slice(0, -2));
		ampm = "p";
	} else if (lower.endsWith("a")) {
		hour = parseInt(part.slice(0, -1));
		ampm = "a";
	} else if (lower.endsWith("p")) {
		hour = parseInt(part.slice(0, -1));
		ampm = "p";
	} else {
		return "0";
	}

	if (!isNaN(hour) && hour >= 1 && hour <= 12) return parseTimeInput(hour, 0, ampm);
	return "0";
}


// --- Alfred JSON Output ---

function createAlfredResponse(title, subtitle, arg, needsRerun = false, allowMods = true, valid = true) {
	const item = {
		title: title,
		subtitle: subtitle,
		arg: arg,
		icon: { path: "icon.png" },
		valid: valid,
	};

    // Add mod for allowing display sleep, but only for valid actions that start a session.
	if (allowMods && arg !== "status" && arg !== "0" && arg !== "deactivate") {
		item.mods = {
			cmd: {
				subtitle: "⌘ Allow display sleep",
				arg: arg,
				variables: { display_sleep_allow: "true" },
			},
		};
	}

	const response = {
		items: [item],
	};

	if (needsRerun) {
		response.rerun = 1;
	}

	return JSON.stringify(response);
}

function generateOutput(inputResult) {
	if (inputResult === "simple_status") {
		const [originalTitle] = checkStatus().split("|");
        const amp = getAmphetamineApp();
        const isActive = amp && amp.running() && amp.sessionTimeRemaining() !== -3;

		const displayTitle = isActive ? originalTitle : "Amphetamine Dose";
		const subtitle = isActive
			? "Set a new time, check status ('s'), or deactivate ('d')"
			: "Amphetamine deactivated • Set a time to keep your Mac awake";
		return createAlfredResponse(displayTitle, subtitle, "status", false, false, false);
	}

	if (inputResult === "0") {
		return createAlfredResponse("Invalid input", "Please provide a valid time format", "0", false, false, false);
	}

	if (inputResult === "indefinite") {
		return createAlfredResponse("Active indefinitely", "Keep your Mac awake until manually disabled", "indefinite");
	}

	if (inputResult === "deactivate") {
        const amp = getAmphetamineApp();
        const isActive = amp && amp.running() && amp.sessionTimeRemaining() !== -3;
		if (isActive) {
			return createAlfredResponse("Deactivate Amphetamine", "Stop the current session", "deactivate");
		}
		return createAlfredResponse("Amphetamine already deactivated", "No active session to stop", "deactivate", false, false, false);
	}

	if (inputResult === "status") {
		const [title, subtitle, needsRerun] = checkStatus().split("|");
		return createAlfredResponse(title, subtitle, "status", needsRerun === "true", false, false);
	}

	if (inputResult.startsWith("TIME:")) {
		const targetTime = inputResult.substring(5);
		let displayTime;
		try {
			const [hour, minute] = targetTime.split(":").map((n) => parseInt(n));
			const tempDate = new Date();
			tempDate.setHours(hour, minute, 0, 0);
			displayTime = formatTime(tempDate);
		} catch (error) {
			displayTime = targetTime;
		}
		return createAlfredResponse(`Active until ${displayTime}`, "Keep awake until specified time", inputResult);
	}

	const minutes = parseInt(inputResult);
	return createAlfredResponse(
		`Active for ${formatDuration(minutes)}`,
		`Keep awake until around ${calculateEndTime(minutes)}`,
		inputResult,
		minutes > 0 // Rerun only if it's a timed session
	);
}

// --- Main Execution ---

function run(argv) {
    // The input from Alfred is the first argument.
	const input = argv[0] || "";
	return generateOutput(parseInput(input));
}
