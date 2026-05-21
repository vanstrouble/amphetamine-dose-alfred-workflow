#!/bin/zsh --no-rcs

# Unified action processor for Amphetamine Dose Alfred Workflow
# Handles inputs from ams_filter.js
# Inspired by the action_process.zsh from Caffeine Dose workflow

# --- Alfred Preferences ---
readonly TIME_FORMAT=${alfred_time_format:-0} # "0" = 12-hour, "1" = 24-hour
readonly START_NOTIFICATION=${start_notification:-false}
readonly END_NOTIFICATION=${end_notification:-false}
readonly DISPLAY_SLEEP_ALLOW=${display_sleep_allow:-false}

# --- Time Calculation Functions ---

# Calculate end time by adding minutes to current time
calculate_end_time() {
    local minutes=$1
    if [[ "$TIME_FORMAT" == "0" ]]; then
        local time_output=$(date -v+"$minutes"M +"%l:%M %p")
        echo "${time_output# }" # 12-hour format
    else
        date -v+"$minutes"M +"%H:%M" # 24-hour format
    fi
}

# Extract and validate hour and minute from TIME:HH:MM format
parse_time_format() {
    local time_str=${1#TIME:}
    local hour=${time_str%%:*}
    local minute=${time_str#*:}

    if [[ ! "$hour" =~ ^[0-9]+$ || ! "$minute" =~ ^[0-9]+$ || $hour -gt 23 || $minute -gt 59 ]]; then
        echo "Error: Invalid time format: $time_str" >&2
        exit 1
    fi
    echo "$hour $minute"
}

# Calculate minutes from now until target time (handles next-day wrap)
calculate_minutes_until_target() {
    local target_minutes=$(( $1 * 60 + $2 ))
    local current_minutes=$(( $(date +"%-H") * 60 + $(date +"%-M") ))
    local duration=$(( target_minutes - current_minutes ))

    [[ $duration -le 0 ]] && duration=$(( duration + 1440 ))
    echo "$duration"
}

# Format time for display based on user preference
format_display_time() {
    local hour=$1 minute=$2
    if [[ "$TIME_FORMAT" == "0" ]]; then
        local display_hour=$(( hour == 0 ? 12 : hour > 12 ? hour - 12 : hour ))
        local ampm=$([[ $hour -ge 12 ]] && echo "PM" || echo "AM")
        printf "%d:%02d %s" $display_hour $minute $ampm
    else
        printf "%02d:%02d" $hour $minute
    fi
}

# --- Amphetamine Interaction ---

# Generate and echo notification message for Alfred
output_message() {
    local time_text="$1"
    local approximate="$2"
    local allow_display_sleep="$3"

    [[ "$approximate" == "true" ]] && time_text="around $time_text"
    local suffix=$([[ "$allow_display_sleep" == "true" ]] && echo " (Display can sleep)" || echo "")

    if [[ "$START_NOTIFICATION" == "1" ]]; then
        echo "Keeping awake until ${time_text}${suffix}"
    fi
}

# Start a timed Amphetamine session
start_timed_session() {
    local total_minutes=$1
    local allow_display_sleep=$2

    if [[ ! "$total_minutes" =~ ^[0-9]+$ || "$total_minutes" -le 0 ]]; then
        echo "Error: Invalid duration: $total_minutes minutes" >&2
        exit 1
    fi

    local end_notification_script=""
    if [[ "$END_NOTIFICATION" == "true" ]]; then
        end_notification_script="; tell application id \"com.runningwithcrayons.Alfred\" to run trigger \\\"session_ended\\\" in workflow \\\"${alfred_workflow_uid}\\\""
    fi

    osascript -e "tell application \"Amphetamine\" to start new session with options {duration:$total_minutes, interval:minutes, displaySleepAllowed:$allow_display_sleep, onSessionFinishScript:\"${end_notification_script}\"}"
}

# --- Main Processing Logic ---

# Handle TIME:HH:MM input format
handle_target_time() {
    read -r hour minute <<< "$(parse_time_format "$1")"
    local duration=$(calculate_minutes_until_target "$hour" "$minute")

    start_timed_session "$duration" "$DISPLAY_SLEEP_ALLOW"
    output_message "$(format_display_time "$hour" "$minute")" "false" "$DISPLAY_SLEEP_ALLOW"
}

# Handle numeric minute duration input
handle_duration() {
    start_timed_session "$1" "$DISPLAY_SLEEP_ALLOW"
    output_message "$(calculate_end_time "$1")" "true" "$DISPLAY_SLEEP_ALLOW"
}

# Handle indefinite session
handle_indefinite() {
    local end_notification_script=""
    if [[ "$END_NOTIFICATION" == "true" ]]; then
        end_notification_script="; tell application id \"com.runningwithcrayons.Alfred\" to run trigger \\\"session_ended\\\" in workflow \\\"${alfred_workflow_uid}\\\""
    fi

    osascript -e "tell application \"Amphetamine\" to start new session with options {displaySleepAllowed:$DISPLAY_SLEEP_ALLOW, onSessionFinishScript:\"${end_notification_script}\"}"
    if [[ "$START_NOTIFICATION" == "true" ]]; then
        local suffix=$([[ "$DISPLAY_SLEEP_ALLOW" == "true" ]] && echo " (Display can sleep)" || echo "")
        echo "Keeping awake indefinitely${suffix}"
    fi
}

# Handle deactivation
handle_deactivation() {
    if osascript -e 'tell application "Amphetamine" to return session is active' >/dev/null 2>&1; then
        osascript -e 'tell application "Amphetamine" to end session'
        # The end notification is handled by the onSessionFinishScript, so we don't echo here.
    fi
}

main() {
    local INPUT="${hotkey_value:-$1}"

    [[ -z "$INPUT" || "$INPUT" == "0" ]] && exit 0 # Exit silently for invalid/empty input

    case "$INPUT" in
        indefinite)
            handle_indefinite
            ;;
        deactivate)
            handle_deactivation
            ;;
        TIME:*)
            handle_target_time "$INPUT"
            ;;
        [0-9]*)
            [[ "$INPUT" =~ ^[0-9]+$ ]] && handle_duration "$INPUT" || {
                echo "Error: Invalid input format: $INPUT" >&2
                exit 1
            }
            ;;
        *)
            echo "Error: Invalid input format: $INPUT" >&2
            exit 1
            ;;
    esac
}

main "$@"
