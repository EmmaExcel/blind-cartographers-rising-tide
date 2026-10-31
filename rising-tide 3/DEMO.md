# Submission walkthrough

## What this project demonstrates

A real multiplayer social-deduction game with server-authoritative turns, per-connection map privacy, a custom 3D presentation and no login or database. Players hold different clues, share a limited signal vocabulary and navigate an expedition under a rising tide. Four or more players introduce a secret adversary.

## A three-minute demonstration

1. Open the game in four separate tabs or devices. Show the three-screen tutorial once, create a room and join using the four-letter code. Each tab has a separate reconnect credential.
2. Show the crew at base camp and the Meet the crew close-up. Ready everyone and start.
3. Compare two honest players' clues. Point out the different rows/columns and unknown slate-gray tiles. Keep the Saboteur's screen private during a real match.
4. Send three signals. Show the crew feed, the shared countdown and disabled fourth signal.
5. On the Navigator's screen, select an outlined 3D tile and confirm. Show every device moving to the same next turn. Switch to the flat chart to demonstrate equivalent controls.
6. Refresh a tab during play. The same private clues and role return without rejoining.
7. Call the emergency council. Submit secret votes. For a controlled demonstration, use the actual Saboteur's identity from their screen and choose that player with a majority.
8. Show the complete-map reveal, role reveal, expedition path and Play again.

Also test a wrong accusation, a vote tie, a missed Navigator turn, a trap penalty, a flood loss and leaving as host. Automated coverage includes these state rules and privacy checks.

## Before sending a final submission

- Deploy the repository as one Node web service on Render Free. Start: npm start. Port: process.env.PORT. Health: /health.
- Check the public URL on a phone using mobile data while another player joins over a different network.
- Verify touch selection, sound opt-in, reconnect and text legibility on the actual submission devices.
- Include the public URL and repository URL in the submission. Both remain pending in this build.
- Describe the free-host limitation: rooms are in memory and disappear after process restarts, redeploys or service sleep.

The explorers are original stylized procedural 3D characters. There are no licensed external character models or commercial assets.
