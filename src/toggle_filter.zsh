#!/bin/zsh --no-rcs

STATE=$(osascript -e 'tell application "Amphetamine" to return session is active' 2>/dev/null)

if [[ "$STATE" != "true" ]]; then
    echo '{"items":[{"title":"Turn On","subtitle":"Prevent sleep indefinitely","arg":"indefinite","icon":{"path":"icon.png"},"mods":{"cmd":{"subtitle":"⌘ Allow display sleep","arg":"indefinite","variables":{"display_sleep_allow":"true"}}}}]}'
else
    echo '{"items":[{"title":"Turn Off","subtitle":"Allow computer to sleep","arg":"deactivate","icon":{"path":"icon.png"}}]}'
fi
