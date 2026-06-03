#!/bin/zsh --no-rcs

allow_sleep="false"
case "${hotkey_allow_sleep:l}" in
    true|1|yes|on)
        allow_sleep="true"
        ;;
esac

STATE=$(osascript -e 'tell application "Amphetamine" to return session is active' 2>/dev/null)

if [[ "$STATE" == "true" ]]; then
    echo "{\"alfredworkflow\":{\"arg\":\"deactivate\",\"variables\":{\"display_sleep_allow\":\"$allow_sleep\"}}}"
else
    echo "{\"alfredworkflow\":{\"arg\":\"indefinite\",\"variables\":{\"display_sleep_allow\":\"$allow_sleep\"}}}"
fi
