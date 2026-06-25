// ==========================================
// F.R.E.S.H. AUTO-REGULATOR ENGINE
// ==========================================
const FRESH_SYSTEM = {
    sessionState: { jointFreshness: null },
    
    getLogs: () => JSON.parse(localStorage.getItem('spikefit_fresh_logs')) || [],
    
    saveLog: (logEntry) => {
        const logs = FRESH_SYSTEM.getLogs();
        logs.push(logEntry);

        const now = Date.now();
        const PRUNE_WINDOW_MS = 28 * 86400000;
        const trimmedLogs = logs.filter(log => (now - log.timestamp) <= PRUNE_WINDOW_MS);

        try {
            localStorage.setItem('spikefit_fresh_logs', JSON.stringify(trimmedLogs));
        } catch (err) {
            console.error('Failed to save F.R.E.S.H. log to localStorage (storage may be full or unavailable).', err);
            showToast('⚠️ Save Failed', "Your browser couldn't save this workout's load data — storage may be full or restricted.", '⚠️', 8000);
        }
    },
    
    calculateACWR: () => {
        const logs = FRESH_SYSTEM.getLogs();
        const now = Date.now();
        const ONE_DAY = 86400000;
        let acuteLoad = 0;   
        let chronicLoad = 0; 
        let oldestTimestamp = now;

        if (logs.length === 0) {
            return { ratio: 0, status: 'baseline', acuteLoad: 0, chronicLoad: 0 };
        }

        logs.forEach(log => {
            const daysOld = (now - log.timestamp) / ONE_DAY;
            if (daysOld <= 28) {
                // FIX: Only update oldestTimestamp for logs within the active 28-day window.
                // Previously this ran for ALL logs, so a stale test session from >28 days ago
                // would inflate daysActive → weeksActive → deflate averageWeeklyChronic → inflate ratio.
                if (log.timestamp < oldestTimestamp) {
                    oldestTimestamp = log.timestamp;
                }
                chronicLoad += log.session.load;
                if (daysOld <= 7) { acuteLoad += log.session.load; }
            }
        });

        // FIX: Use proportional weeks (bounded 1–4) instead of Math.ceil.
        // Math.ceil(8 days / 7) = 2 weeks, which halved averageWeeklyChronic and doubled the ratio.
        // Proportional division (8 / 7 = 1.14) gives an accurate chronic average for partial weeks.
        const daysActive = (now - oldestTimestamp) / ONE_DAY;

        // BASELINE GATE: With less than 14 days of data, the acute (7-day) and chronic
        // (28-day) windows substantially overlap, so the ratio is mathematically near-locked
        // to ~1.0 regardless of actual training variation — it isn't a meaningful signal yet.
        // Surface "building baseline" instead of a number that looks precise but isn't.
        const BASELINE_THRESHOLD_DAYS = 14;
        if (daysActive < BASELINE_THRESHOLD_DAYS) {
            return {
                ratio: 0,
                status: 'baseline',
                acuteLoad: Math.round(acuteLoad),
                chronicLoad: Math.round(chronicLoad),
                baseline: true,
                daysRemaining: Math.ceil(BASELINE_THRESHOLD_DAYS - daysActive)
            };
        }

        const weeksActive = Math.max(1, Math.min(4, daysActive / 7));

        // Chronic load is expressed as a weekly average over the active weeks
        const averageWeeklyChronic = chronicLoad / weeksActive;
        
        if (averageWeeklyChronic === 0) {
            return { ratio: 0, status: 'baseline', acuteLoad, chronicLoad: 0 };
        }

        const ratio = (acuteLoad / averageWeeklyChronic).toFixed(2);
        const floatRatio = parseFloat(ratio);
        
        // Status logic with cold-start guardrails
        let status = 'optimal';
        if (floatRatio >= 1.5) {
            // Require at least 3 logged sessions before throwing a hard "Danger" block
            status = logs.length < 3 ? 'caution' : 'danger';
        } else if (floatRatio >= 1.3) {
            status = 'caution';
        }
        
        return {
            ratio: floatRatio,
            status: status,
            acuteLoad: Math.round(acuteLoad),
            chronicLoad: Math.round(averageWeeklyChronic)
        };
    },

    needsRegulation: () => {
        const acwr = FRESH_SYSTEM.calculateACWR();
        const joints = FRESH_SYSTEM.sessionState.jointFreshness;
        return acwr.status === 'danger' || (joints !== null && joints < 5);
    },

    openDashboardModal: () => {
        const data = FRESH_SYSTEM.calculateACWR();
        const statusEl = document.getElementById('fresh-status');
        const ratioEl = document.getElementById('fresh-ratio');

        if (data.baseline) {
            // Less than 14 days of data — ratio would be a misleading near-1.0 number, so
            // show progress toward a meaningful baseline instead.
            ratioEl.textContent = '—';
            statusEl.textContent = `Building Baseline (${data.daysRemaining}d left)`;
        } else {
            ratioEl.textContent = data.ratio > 0 ? data.ratio.toFixed(2) : '0.00';
            statusEl.textContent = data.status;
        }
        document.getElementById('fresh-acute').textContent = data.acuteLoad;
        document.getElementById('fresh-chronic').textContent = data.chronicLoad;

        if (data.status === 'danger') {
            statusEl.style.color = 'var(--accent)'; 
            ratioEl.style.color = 'var(--accent)';
        } else if (data.status === 'caution') {
            statusEl.style.color = '#ff9800'; 
            ratioEl.style.color = '#ff9800';
        } else if (data.status === 'optimal') {
            statusEl.style.color = '#4CAF50'; 
            ratioEl.style.color = '#4CAF50';
        } else {
            statusEl.style.color = 'var(--text-main)'; 
            ratioEl.style.color = 'var(--text-main)';
        }
        document.getElementById('fresh-modal').style.display = 'flex';
    },

    closeDashboardModal: () => {
        document.getElementById('fresh-modal').style.display = 'none';
    }
};

// --- Workout Database ---
const workouts = {
    'A': {
        name: 'Workout A: Vertical Power',
        blocks: [
            {
                title: 'Superset 1 (4 Rounds - Rest 60-90s)',
                exercises: [
                    { id: 'a1', name: 'Seated Box Jumps', reps: '5 reps', notes: 'Explode up, jump down, land on two feet.', video: 'Seated Box Jumps', impact: 'high', alt: { name: 'Kettlebell Swings', reps: '15 reps', notes: 'Explosive hip hinge. Protect the knees.', video: 'Kettlebell Swings' } },
                    { id: 'a2', name: 'Pogo Jumps', reps: '15 seconds', notes: 'Max ankle stiffness.', video: 'Pogo Jumps exercise' }
                ]
            },
            {
                title: 'Superset 2 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'a3', name: 'DB Reverse Lunges', reps: '8 reps / leg', notes: 'Drive through front heel.', video: 'Dumbbell Reverse Lunges' },
                    { id: 'a4', name: 'Dead Bugs', reps: '10 reps / side', notes: 'Lower back glued to floor.', video: 'Dead Bug exercise' }
                ]
            }
        ]
    },
    'A2': {
        name: 'Workout A: Vertical Power (Intermediate)',
        blocks: [
            {
                title: 'Superset 1 (4 Rounds - Rest 60-90s)',
                exercises: [
                    { id: 'a2-1', name: 'Seated Box Jumps', reps: '5 reps', notes: 'Explode up, jump down, land on two feet.', video: 'Seated Box Jumps', impact: 'high', alt: { name: 'Kettlebell Swings', reps: '15 reps', notes: 'Explosive hip hinge. Protect the knees.', video: 'Kettlebell Swings' } },
                    { id: 'a2-2', name: 'Pogo Jumps', reps: '20 seconds', notes: 'Max ankle stiffness and height.', video: 'Pogo Jumps exercise' },
                    { id: 'a2-3', name: 'Broad Jumps', reps: '5 reps', notes: 'Explode forward, stick the landing.', video: 'Broad Jumps', impact: 'high', alt: { name: 'Glute Bridges', reps: '15 reps', notes: 'Squeeze glutes at the top.', video: 'Glute Bridge' } }
                ]
            },
            {
                title: 'Superset 2 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'a2-4', name: 'DB Reverse Lunges', reps: '10 reps / leg', notes: 'Drive through front heel.', video: 'Dumbbell Reverse Lunges' },
                    { id: 'a2-5', name: 'Dead Bugs', reps: '12 reps / side', notes: 'Lower back glued to floor.', video: 'Dead Bug exercise' },
                    { id: 'a2-6', name: 'DB Romanian Deadlifts', reps: '10 reps', notes: 'Hinge at the hips, slight knee bend.', video: 'Dumbbell RDL' }
                ]
            }
        ]
    },
    'B': {
        name: 'Workout B: Upper Body Armor',
        blocks: [
            {
                title: 'Superset 1 (4 Rounds - Rest 60-90s)',
                exercises: [
                    { id: 'b1', name: 'DB Push Press', reps: '8 reps', notes: 'Slight knee dip to drive up.', video: 'Dumbbell Push Press' },
                    { id: 'b2', name: 'Pull-Ups or DB Rows', reps: '8-10 reps', notes: 'Squeeze back at the top.', video: 'Dumbbell Rows' }
                ]
            },
            {
                title: 'Superset 2 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'b3', name: 'DB Scaption (Y-Raises)', reps: '10 reps', notes: '45-deg angle, thumbs up.', video: 'Dumbbell Scaption' },
                    { id: 'b4', name: 'Weighted Russian Twists', reps: '15 reps / side', notes: 'Rotate torso, not just arms.', video: 'Weighted Russian Twists' }
                ]
            }
        ]
    },
    'B2': {
        name: 'Workout B: Upper Body Armor (Intermediate)',
        blocks: [
            {
                title: 'Superset 1 (4 Rounds - Rest 60-90s)',
                exercises: [
                    { id: 'b2-1', name: 'DB Push Press', reps: '10 reps', notes: 'Slight knee dip to drive up.', video: 'Dumbbell Push Press' },
                    { id: 'b2-2', name: 'Pull-Ups or DB Rows', reps: '10-12 reps', notes: 'Squeeze back at the top.', video: 'Dumbbell Rows' },
                    { id: 'b2-3', name: 'Push-Ups', reps: 'Max Reps', notes: 'Strict form, stop 1 rep shy of failure.', video: 'Perfect Pushup' }
                ]
            },
            {
                title: 'Superset 2 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'b2-4', name: 'DB Scaption (Y-Raises)', reps: '12 reps', notes: '45-deg angle, thumbs up.', video: 'Dumbbell Scaption' },
                    { id: 'b2-5', name: 'Weighted Russian Twists', reps: '20 reps / side', notes: 'Rotate torso, not just arms.', video: 'Weighted Russian Twists' },
                    { id: 'b2-6', name: 'Superman Holds', reps: '15 reps', notes: 'Squeeze glutes and back, hold 1s at top.', video: 'Superman Exercise' }
                ]
            }
        ]
    },
    'C': {
        name: 'Workout C: Defense Agility',
        blocks: [
            {
                title: 'Superset 1 (4 Rounds - Rest 60-90s)',
                exercises: [
                    { id: 'c1', name: 'Single-Arm DB Snatches', reps: '6 reps / arm', notes: 'Power from the hips.', video: 'Single-Arm Dumbbell Snatch' },
                    { id: 'c2', name: 'Lateral Lunges', reps: '8 reps / leg', notes: 'Push hips back.', video: 'Lateral Lunges' }
                ]
            },
            {
                title: 'Superset 2 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'c3', name: 'Push-Up to Renegade Row', reps: '8 reps / arm', notes: 'Keep hips square to floor.', video: 'Push-Up to Renegade Row' },
                    { id: 'c4', name: 'Plank w/ Shoulder Taps', reps: '40 seconds', notes: 'Anti-rotation core hold.', video: 'Plank with Shoulder Taps' }
                ]
            }
        ],
    },
    'C2': {
        name: 'Workout C: Defense Agility (Intermediate)',
        blocks: [
            {
                title: 'Superset 1 (4 Rounds - Rest 60-90s)',
                exercises: [
                    { id: 'c2-1', name: 'Single-Arm DB Snatches', reps: '8 reps / arm', notes: 'Power from the hips.', video: 'Single-Arm Dumbbell Snatch' },
                    { id: 'c2-2', name: 'Lateral Lunges', reps: '10 reps / leg', notes: 'Push hips back.', video: 'Lateral Lunges' },
                    { id: 'c2-3', name: 'Skater Jumps', reps: '10 reps / side', notes: 'Explosive lateral push off outside leg.', video: 'Skater Jumps', impact: 'high', alt: { name: 'Lateral Band Walks', reps: '10 reps / side', notes: 'Keep tension on the band.', video: 'Lateral Band Walks' } }
                ]
            },
            {
                title: 'Superset 2 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'c2-4', name: 'Push-Up to Renegade Row', reps: '8 reps / arm', notes: 'Keep hips square to floor.', video: 'Push-Up to Renegade Row' },
                    { id: 'c2-5', name: 'Plank w/ Shoulder Taps', reps: '45 seconds', notes: 'Anti-rotation core hold.', video: 'Plank with Shoulder Taps' },
                    { id: 'c2-6', name: 'Mountain Climbers', reps: '30 seconds', notes: 'Fast pace, keep hips level.', video: 'Mountain Climbers' }
                ]
            }
        ],
    },
    'D': {
        name: 'Workout D: Core & Swing Mechanics',
        blocks: [
            {
                title: 'Volleyball Core (3 Rounds - Rest 45s)',
                exercises: [
                    { id: 'd1', name: 'Hollow Body Hold', reps: '30 seconds', notes: 'Mimics pre-swing mid-air tension. Press lower back into floor.', video: 'Hollow Body Hold' },
                    { id: 'd2', name: 'Seated Rotational Twists', reps: '15 reps / side', notes: 'Focus on torso rotation to simulate arm swing torque.', video: 'Russian Twists' },
                    { id: 'd3', name: 'Bird-Dog', reps: '10 reps / side', notes: 'Slow and controlled. Builds back and core stability.', video: 'Bird Dog Exercise' }
                ]
            },
            {
                title: 'Swing Mechanics (Focus on Form - Rest as needed)',
                exercises: [
                    { id: 'd4', name: 'Half-Kneeling Swings (Left Knee Up)', reps: '20 reps', notes: 'Left knee bent, right knee on floor. Focus on elbow draw and torque.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' },
                    { id: 'd5', name: 'Half-Kneeling Swings (Right Knee Up)', reps: '20 reps', notes: 'Right knee bent, left knee on floor. Maintain high elbow.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' },
                    { id: 'd6', name: 'Tall Kneeling Swings', reps: '20 reps', notes: 'Both knees on floor. Engage core to snap through the swing.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' }
                ]
            }
        ]
    },
    'D2': {
        name: 'Workout D: Core & Swing Mechanics (Intermediate)',
        blocks: [
            {
                title: 'Volleyball Core (3 Rounds - Rest 45s)',
                exercises: [
                    { id: 'd2-1', name: 'Hollow Body Hold', reps: '45 seconds', notes: 'Mimics pre-swing mid-air tension. Press lower back into floor.', video: 'Hollow Body Hold' },
                    { id: 'd2-2', name: 'Seated Rotational Twists', reps: '20 reps / side', notes: 'Focus on torso rotation to simulate arm swing torque.', video: 'Russian Twists' },
                    { id: 'd2-3', name: 'Bird-Dog', reps: '12 reps / side', notes: 'Slow and controlled. Builds back and core stability.', video: 'Bird Dog Exercise' },
                    { id: 'd2-4', name: 'Side Plank', reps: '30 seconds / side', notes: 'Keep body in a straight line, push floor away.', video: 'Side Plank' }
                ]
            },
            {
                title: 'Swing Mechanics (Focus on Form - Rest as needed)',
                exercises: [
                    { id: 'd2-5', name: 'Half-Kneeling Swings (Left Knee Up)', reps: '25 reps', notes: 'Left knee bent, right knee on floor. Focus on elbow draw and torque.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' },
                    { id: 'd2-6', name: 'Half-Kneeling Swings (Right Knee Up)', reps: '25 reps', notes: 'Right knee bent, left knee on floor. Maintain high elbow.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' },
                    { id: 'd2-7', name: 'Tall Kneeling Swings', reps: '25 reps', notes: 'Both knees on floor. Engage core to snap through the swing.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' },
                    { id: 'd2-8', name: 'Standing Arm Swings', reps: '20 reps', notes: 'Full standing swing mechanics, focus on quick torque.', video: 'Volleyball Arm Swing Mechanics' },
                    { id: 'd2-9', name: 'Approach Jumps w/ 2-Foot Landing', reps: '10 reps', notes: 'Full approach jump. Prioritize landing softly on BOTH feet simultaneously to absorb impact.', video: 'Volleyball 2-Foot Landing', url: 'https://www.tiktok.com/@elevateyourselfofficial/video/7112060380637056299', impact: 'high', alt: { name: 'Approach Footwork', reps: '10 reps', notes: 'Focus on explosive last two steps, no jump.', video: 'Volleyball Approach Footwork' } }
                ]
            }
        ]
    },
    'A3': {
        name: 'Workout A: Vertical Power (Advanced)',
        blocks: [
            {
                title: 'Superset 1 (4 Rounds - Rest 60-90s)',
                exercises: [
                    { id: 'a3-1', name: 'Seated Box Jumps', reps: '6 reps', notes: 'Explode up, jump down, land on two feet.', video: 'Seated Box Jumps', impact: 'high', alt: { name: 'Kettlebell Swings', reps: '20 reps', notes: 'Explosive hip hinge. Protect the knees.', video: 'Kettlebell Swings' } },
                    { id: 'a3-2', name: 'Pogo Jumps', reps: '30 seconds', notes: 'Max ankle stiffness and height.', video: 'Pogo Jumps exercise' },
                    { id: 'a3-3', name: 'Broad Jumps', reps: '6 reps', notes: 'Explode forward, stick the landing.', video: 'Broad Jumps', impact: 'high', alt: { name: 'Glute Bridges', reps: '20 reps', notes: 'Squeeze glutes at the top.', video: 'Glute Bridge' } }
                ]
            },
            {
                title: 'Superset 2 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'a3-4', name: 'DB Reverse Lunges', reps: '12 reps / leg', notes: 'Drive through front heel.', video: 'Dumbbell Reverse Lunges' },
                    { id: 'a3-5', name: 'Dead Bugs', reps: '15 reps / side', notes: 'Lower back glued to floor.', video: 'Dead Bug exercise' },
                    { id: 'a3-6', name: 'DB Romanian Deadlifts', reps: '12 reps', notes: 'Hinge at the hips, slight knee bend.', video: 'Dumbbell RDL' }
                ]
            },
            {
                title: 'Superset 3 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'a3-7', name: 'Bulgarian Split Squats', reps: '8 reps / leg', notes: 'Keep chest up, drop back knee down.', video: 'Bulgarian Split Squat' },
                    { id: 'a3-8', name: 'Depth Drops', reps: '5 reps', notes: 'Step off low box, stick landing instantly.', video: 'Depth Drop', impact: 'high', alt: { name: 'Squat Pulses', reps: '20 seconds', notes: 'Stay low, pulse up and down.', video: 'Squat Pulses' } },
                    { id: 'a3-9', name: 'Calf Raises', reps: '20 reps', notes: 'Full extension, slow negative.', video: 'Standing Calf Raise' }
                ]
            }
        ]
    },
    'B3': {
        name: 'Workout B: Upper Body Armor (Advanced)',
        blocks: [
            {
                title: 'Superset 1 (4 Rounds - Rest 60-90s)',
                exercises: [
                    { id: 'b3-1', name: 'DB Push Press', reps: '12 reps', notes: 'Slight knee dip to drive up.', video: 'Dumbbell Push Press' },
                    { id: 'b3-2', name: 'Pull-Ups or DB Rows', reps: '12-15 reps', notes: 'Squeeze back at the top.', video: 'Dumbbell Rows' },
                    { id: 'b3-3', name: 'Push-Ups', reps: 'Max Reps', notes: 'Strict form, stop 1 rep shy of failure.', video: 'Perfect Pushup' }
                ]
            },
            {
                title: 'Superset 2 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'b3-4', name: 'DB Scaption (Y-Raises)', reps: '15 reps', notes: '45-deg angle, thumbs up.', video: 'Dumbbell Scaption' },
                    { id: 'b3-5', name: 'Weighted Russian Twists', reps: '25 reps / side', notes: 'Rotate torso, not just arms.', video: 'Weighted Russian Twists' },
                    { id: 'b3-6', name: 'Superman Holds', reps: '20 reps', notes: 'Squeeze glutes and back, hold 1s at top.', video: 'Superman Exercise' }
                ]
            },
            {
                title: 'Superset 3 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'b3-7', name: 'Pike Push-Ups', reps: '10 reps', notes: 'Hips high, focus on shoulders.', video: 'Pike Pushup' },
                    { id: 'b3-8', name: 'DB Lateral Raises', reps: '12 reps', notes: 'Slight bend in elbows, control down.', video: 'Dumbbell Lateral Raise' },
                    { id: 'b3-9', name: 'Plank to Down-Dog', reps: '10 reps', notes: 'Flow smoothly, stretch shoulders.', video: 'Plank to Downward Dog' }
                ]
            }
        ]
    },
    'C3': {
        name: 'Workout C: Defense Agility (Advanced)',
        blocks: [
            {
                title: 'Superset 1 (4 Rounds - Rest 60-90s)',
                exercises: [
                    { id: 'c3-1', name: 'Single-Arm DB Snatches', reps: '8 reps / arm', notes: 'Power from the hips.', video: 'Single-Arm Dumbbell Snatch' },
                    { id: 'c3-2', name: 'Lateral Lunges', reps: '12 reps / leg', notes: 'Push hips back.', video: 'Lateral Lunges' },
                    { id: 'c3-3', name: 'Skater Jumps', reps: '12 reps / side', notes: 'Explosive lateral push off outside leg.', video: 'Skater Jumps', impact: 'high', alt: { name: 'Lateral Band Walks', reps: '12 reps / side', notes: 'Keep tension on the band.', video: 'Lateral Band Walks' } }
                ]
            },
            {
                title: 'Superset 2 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'c3-4', name: 'Push-Up to Renegade Row', reps: '10 reps / arm', notes: 'Keep hips square to floor.', video: 'Push-Up to Renegade Row' },
                    { id: 'c3-5', name: 'Plank w/ Shoulder Taps', reps: '60 seconds', notes: 'Anti-rotation core hold.', video: 'Plank with Shoulder Taps' },
                    { id: 'c3-6', name: 'Mountain Climbers', reps: '40 seconds', notes: 'Fast pace, keep hips level.', video: 'Mountain Climbers' }
                ]
            },
            {
                title: 'Superset 3 (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'c3-7', name: 'Lateral Bounds', reps: '8 reps / side', notes: 'Jump sideways off one leg, stick landing.', video: 'Lateral Bounds', impact: 'high', alt: { name: 'Lateral Lunges', reps: '8 reps / side', notes: 'Push hips back.', video: 'Lateral Lunges' } },
                    { id: 'c3-8', name: 'Bear Crawls', reps: '30 seconds', notes: 'Keep knees hovering just off floor.', video: 'Bear Crawl' },
                    { id: 'c3-9', name: 'High Knees', reps: '30 seconds', notes: 'Pump arms, drive knees up fast.', video: 'High Knees' }
                ]
            }
        ],
    },
    'D3': {
        name: 'Workout D: Core & Swing Mechanics (Advanced)',
        blocks: [
            {
                title: 'Superset 1: Volleyball Core (3 Rounds - Rest 45s)',
                exercises: [
                    { id: 'd3-1', name: 'Hollow Body Hold', reps: '60 seconds', notes: 'Mimics pre-swing mid-air tension. Press lower back into floor.', video: 'Hollow Body Hold' },
                    { id: 'd3-2', name: 'Seated Rotational Twists', reps: '25 reps / side', notes: 'Focus on torso rotation to simulate arm swing torque.', video: 'Russian Twists' },
                    { id: 'd3-3', name: 'Bird-Dog', reps: '15 reps / side', notes: 'Slow and controlled. Builds back and core stability.', video: 'Bird Dog Exercise' }
                ]
            },
            {
                title: 'Superset 2: Swing Mechanics (3 Rounds - Rest as needed)',
                exercises: [
                    { id: 'd3-4', name: 'Half-Kneeling Swings (Left Knee Up)', reps: '30 reps', notes: 'Left knee bent, right knee on floor. Focus on elbow draw and torque.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' },
                    { id: 'd3-5', name: 'Half-Kneeling Swings (Right Knee Up)', reps: '30 reps', notes: 'Right knee bent, left knee on floor. Maintain high elbow.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' },
                    { id: 'd3-6', name: 'Tall Kneeling Swings', reps: '30 reps', notes: 'Both knees on floor. Engage core to snap through the swing.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' }
                ]
            },
            {
                title: 'Superset 3: Dynamic Approach (3 Rounds - Rest 60s)',
                exercises: [
                    { id: 'd3-7', name: 'Standing Arm Swings', reps: '25 reps', notes: 'Full standing swing mechanics, focus on quick torque.', video: 'Volleyball Arm Swing Mechanics' },
                    { id: 'd3-8', name: 'Approach Jump Footwork', reps: '10 reps', notes: 'Focus on explosive last two steps (penultimate step).', video: 'Volleyball Approach Footwork' },
                    { id: 'd3-9', name: 'V-Ups or Med Ball Slams', reps: '15 reps', notes: 'Explosive core flexion.', video: 'V-Ups Exercise' },
                    { id: 'd3-10', name: 'Max Approach Jumps w/ 2-Foot Landing', reps: '10 reps', notes: 'Full max approach. Prioritize landing softly on BOTH feet simultaneously to absorb impact.', video: 'Volleyball 2-Foot Landing', url: 'https://www.tiktok.com/@elevateyourselfofficial/video/7112060380637056299', impact: 'high', alt: { name: 'Approach Footwork', reps: '10 reps', notes: 'Focus on explosive last two steps, no jump.', video: 'Volleyball Approach Footwork' } }
                ]
            }
        ]
    }
};

const schedule = [
    { day: 'Monday',    workout: 'A' },
    { day: 'Tuesday',   workout: 'D' },
    { day: 'Wednesday', workout: 'B' },
    { day: 'Thursday',  workout: 'D' },
    { day: 'Friday',    workout: 'C' },
    { day: 'Saturday',  workout: 'A' },
    { day: 'Sunday',    workout: 'Rest/Run' }
];

// --- State ---
let currentDayIndex     = (new Date().getDay() + 6) % 7;
let completedExercises  = JSON.parse(localStorage.getItem('completedExercises')) || {};
let completedDates      = JSON.parse(localStorage.getItem('completedDates')) || {};
let historyCalDate      = new Date();
let activeWorkoutStart  = localStorage.getItem('activeWorkoutStart') || null;
let workoutLevel        = localStorage.getItem('workoutLevel') || 'beginner';
let manualLevelOverride = localStorage.getItem('manualLevelOverride') === 'true';

window.currentShareBlob = null;

// ─── Core Helpers ─────────────────────────────────────────────────────────────

function getWorkoutKey(baseKey) {
    if (baseKey === 'Rest/Run') return baseKey;
    if (workoutLevel === 'advanced')     return baseKey + '3';
    if (workoutLevel === 'intermediate') return baseKey + '2';
    return baseKey;
}

function saveState() {
    try {
        localStorage.setItem('completedExercises', JSON.stringify(completedExercises));
        localStorage.setItem('completedDates',     JSON.stringify(completedDates));
    } catch (err) {
        console.error('Failed to save workout state to localStorage (storage may be full or unavailable).', err);
        showToast('⚠️ Save Failed', "Your browser couldn't save this update — storage may be full or restricted (e.g. private browsing).", '⚠️', 8000);
    }
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
// switchTab now accepts the button element directly — avoids relying on
// the implicit global `event` object that the old inline onclick used.
function switchTab(tabId, btn) {
    document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');

    if (window.innerWidth <= 980) {
        window.scrollTo({ top: document.getElementById('main').offsetTop - 20, behavior: 'smooth' });
    }
}

// ─── Exercise Interaction ─────────────────────────────────────────────────────

function toggleExercise(id, cardElement) {
    if (!activeWorkoutStart) return;

    completedExercises[id] = !completedExercises[id];
    saveState();

    if (completedExercises[id]) {
        cardElement.classList.add('completed');
        cardElement.querySelector('input').checked = true;
        checkAndMarkComplete();
    } else {
        cardElement.classList.remove('completed');
        cardElement.querySelector('input').checked = false;
    }
    updateProgressBar();
}

function updateProgressBar() {
    const baseWorkoutKey = schedule[currentDayIndex].workout;
    const workoutKey     = getWorkoutKey(baseWorkoutKey);
    const workout        = workouts[workoutKey];

    if (!workout || !activeWorkoutStart) {
        document.getElementById('progress-container').style.display = 'none';
        return;
    }

    document.getElementById('progress-container').style.display = 'block';
    let totalEx = 0, checkedEx = 0;

    workout.blocks.forEach(block => {
        block.exercises.forEach(ex => {
            totalEx++;
            if (completedExercises[ex.id]) checkedEx++;
        });
    });

    const pct = totalEx === 0 ? 0 : Math.round((checkedEx / totalEx) * 100);
    document.getElementById('progress-bar').style.width = pct + '%';
}

function checkAndMarkComplete() {
    const baseWorkoutKey = schedule[currentDayIndex].workout;
    const workoutKey     = getWorkoutKey(baseWorkoutKey);
    const workout        = workouts[workoutKey];
    if (!workout) return;

    let allChecked = true;
    for (const block of workout.blocks) {
        for (const ex of block.exercises) {
            if (!completedExercises[ex.id]) { allChecked = false; break; }
        }
        if (!allChecked) break;
    }
    if (allChecked) {
        if (activeWorkoutStart) {
            // Reset slider state before opening
            document.getElementById('rpe-slider').value = 7;
            document.getElementById('rpe-val').innerText = '7';
            document.getElementById('fresh-rpe-modal').style.display = 'flex';
        } else {
            markWorkoutComplete();
        }
    }
}

function resetDay() {
    if (confirm('Clear all checks for today?')) {
        const baseWorkoutKey = schedule[currentDayIndex].workout;
        const workoutKey     = getWorkoutKey(baseWorkoutKey);
        const currentWorkout = workouts[workoutKey];

        if (currentWorkout) {
            currentWorkout.blocks.forEach(block => {
                block.exercises.forEach(ex => { completedExercises[ex.id] = false; });
            });
        }
        activeWorkoutStart = null;
        localStorage.removeItem('activeWorkoutStart');
        saveState();
        renderDaily();
    }
}

function setWorkoutDay(index) {
    currentDayIndex = index;
    saveState();
    renderDaily();
    renderSchedule();

    document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('daily').classList.add('active');
    document.querySelectorAll('.nav button')[0].classList.add('active');

    if (window.innerWidth <= 980) {
        window.scrollTo({ top: document.getElementById('main').offsetTop - 20, behavior: 'smooth' });
    }
}

function startWorkout() {
    if (!activeWorkoutStart) {
        activeWorkoutStart = new Date().toISOString();
        localStorage.setItem('activeWorkoutStart', activeWorkoutStart);
        renderDaily();
    }
}

function updateWorkoutStatus() {
    const controlsDiv  = document.getElementById('workout-controls');
    const startBtn     = document.getElementById('btn-start-workout');
    const completeBtn  = document.getElementById('btn-mark-complete');

    const baseWorkoutKey = schedule[currentDayIndex].workout;
    const workoutKey     = getWorkoutKey(baseWorkoutKey);
    const workout        = workouts[workoutKey];

    if (!workout) {
        if (controlsDiv)  controlsDiv.style.display  = 'none';
        if (completeBtn)  completeBtn.style.display   = 'none';
        return;
    } else {
        if (controlsDiv)  controlsDiv.style.display  = 'block';
        if (completeBtn)  completeBtn.style.display   = 'block';
    }

    if (activeWorkoutStart) {
        const startTime = new Date(activeWorkoutStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        startBtn.innerText = `Workout started at ${startTime}`;
        startBtn.classList.add('started');
        startBtn.disabled = true;
        if (completeBtn) completeBtn.disabled = false;
    } else {
        startBtn.innerText = 'Start Workout';
        startBtn.classList.remove('started');
        startBtn.disabled = false;
        if (completeBtn) completeBtn.disabled = true;
    }
}

function markWorkoutComplete() {
    const today      = new Date();
    const year       = today.getFullYear();
    const month      = String(today.getMonth() + 1).padStart(2, '0');
    const day        = String(today.getDate()).padStart(2, '0');
    const dateStr    = `${year}-${month}-${day}`;
    const displayDate = today.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    let mins = 0, durationText = '';
    if (activeWorkoutStart) {
        const durationMs = today - new Date(activeWorkoutStart);
        mins = Math.max(1, Math.floor(durationMs / 60000));
        durationText = ` (${mins} min)`;
    }

    completedDates[dateStr] = { completed: true, startTime: activeWorkoutStart, endTime: today.toISOString() };
    activeWorkoutStart = null;
    localStorage.removeItem('activeWorkoutStart');

    saveState();
    renderHistoryCalendar();
    renderDaily();

    const completedCount = Object.keys(completedDates).length;
    if (completedCount >= 16 && workoutLevel === 'intermediate' && !manualLevelOverride) {
        setLevel('advanced', true);
        showToast('🔥 MAXIMUM OVERDRIVE!', "You've successfully logged four weeks of workouts. We've automatically upgraded your schedule to the Advanced plan!", '🚀', 10000);
    } else if (completedCount >= 8 && workoutLevel === 'beginner' && !manualLevelOverride) {
        setLevel('intermediate', true);
        showToast('🎉 LEVEL UP!', "You've successfully logged two weeks of workouts. We've automatically upgraded your schedule to the Intermediate plan! Keep crushing it!", '⭐', 10000);
    }

    const btn = document.getElementById('btn-mark-complete');
    if (btn) {
        const originalText = 'Mark Workout Complete';
        btn.innerText = `✔ Workout Logged!${durationText}`;
        btn.style.background   = '#4CAF50';
        btn.style.borderColor  = '#4CAF50';
        btn.style.color        = '#ffffff';
        setTimeout(() => {
            btn.innerText          = originalText;
            btn.style.background   = '';
            btn.style.borderColor  = '';
            btn.style.color        = '';
        }, 4000);
    }

    generateShareImage(document.getElementById('current-workout-title').innerText, displayDate, mins);
    document.getElementById('badge-modal').style.display = 'flex';
}

// ─── Badge / Share ────────────────────────────────────────────────────────────

async function generateShareImage(workoutName, dateStr, durationMins) {
    const previewImg = document.getElementById('share-image-preview');
    const loader     = document.getElementById('badge-loader');
    const shareBtn   = document.getElementById('btn-share-badge');

    previewImg.style.display = 'none';
    loader.style.display     = 'block';
    shareBtn.disabled        = true;
    shareBtn.innerText       = 'Generating Badge...';

    // Ensure the webfont is actually loaded before drawing canvas text.
    // Race against a timeout so a slow/blocked font file can't hang badge generation.
    try {
        await Promise.race([
            Promise.all([
                document.fonts.load('bold 55px "Source Sans 3"'),
                document.fonts.load('bold 95px "Source Sans 3"'),
                document.fonts.load('60px "Source Sans 3"'),
                document.fonts.load('bold 45px "Source Sans 3"')
            ]),
            new Promise(resolve => setTimeout(resolve, 2000))
        ]);
    } catch (err) {
        console.warn('Font load check failed, proceeding with fallback font.', err);
    }

    const canvas = document.createElement('canvas');
    canvas.width  = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1a0e24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgGlow = ctx.createRadialGradient(canvas.width / 2, 400, 50, canvas.width / 2, 400, 500);
    bgGlow.addColorStop(0, 'rgba(232, 10, 137, 0.25)');
    bgGlow.addColorStop(1, 'rgba(26, 14, 36, 0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve) => {
        img.onload  = resolve;
        img.onerror = () => {
            console.warn('Failed to load local character image. Falling back to remote raw github URL.');
            img.crossOrigin = 'anonymous';
            img.onerror = resolve;
            img.src = 'https://raw.githubusercontent.com/jfrappier/spikefit/refs/heads/main/img/badge_char.png';
        };
        if (window.location.protocol === 'file:') {
            img.src = 'https://raw.githubusercontent.com/jfrappier/spikefit/refs/heads/main/img/badge_char.png';
        } else {
            img.src = 'img/badge_char.png';
        }
    });

    if (img.complete && img.naturalWidth > 0) {
        const maxHeight = 780;
        const maxWidth  = canvas.width * 0.95;
        const scale     = Math.min(maxWidth / img.width, maxHeight / img.height);
        const drawWidth  = img.width  * scale;
        const drawHeight = img.height * scale;
        const offsetX    = (canvas.width - drawWidth) / 2;
        const offsetY    = Math.max(0, (maxHeight - drawHeight) / 2);

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        const gradient = ctx.createLinearGradient(0, 650, 0, 800);
        gradient.addColorStop(0, 'rgba(26, 14, 36, 0)');
        gradient.addColorStop(1, 'rgba(26, 14, 36, 1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 650, canvas.width, 150);
    }

    ctx.textAlign  = 'center';
    ctx.fillStyle  = '#e80a89';
    ctx.font       = 'bold 55px "Source Sans 3", Arial, sans-serif';
    ctx.fillText('SPIKEFIT', canvas.width / 2, 85);

    ctx.fillStyle   = '#ffffff';
    ctx.font        = 'bold 95px "Source Sans 3", Arial, sans-serif';
    ctx.shadowColor = 'rgba(232, 10, 137, 0.5)';
    ctx.shadowBlur  = 20;
    ctx.fillText('WORKOUT COMPLETE', canvas.width / 2, 780);
    ctx.shadowBlur  = 0;

    ctx.fillStyle = '#fce8f3';
    ctx.font      = '60px "Source Sans 3", Arial, sans-serif';
    ctx.fillText(workoutName, canvas.width / 2, 880);

    ctx.fillStyle = '#e80a89';
    ctx.fillRect(canvas.width / 2 - 75, 930, 150, 6);

    ctx.fillStyle = '#a0aec0';
    ctx.font      = 'bold 45px "Source Sans 3", Arial, sans-serif';
    ctx.fillText(`${dateStr}   •   ${durationMins > 0 ? durationMins + ' MINS' : 'LOGGED'}`, canvas.width / 2, 1010);

    try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        previewImg.src = dataUrl;
        window.currentShareBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    } catch (err) {
        console.error('Canvas export failed (canvas is likely tainted by a security policy).', err);
        window.currentShareBlob = null;
    }

    loader.style.display     = 'none';
    previewImg.style.display = 'block';
    shareBtn.disabled        = false;
    shareBtn.innerText       = 'Share Workout';
}

async function shareBadge() {
    const workoutName = document.getElementById('current-workout-title').innerText;
    const textToShare = `I just crushed "${workoutName}" on SpikeFit! 🏐🔥`;
    const shareBtn    = document.getElementById('btn-share-badge');
    const origTxt     = shareBtn.innerText;

    try {
        shareBtn.innerText = 'Preparing...';

        if (window.currentShareBlob) {
            const file      = new File([window.currentShareBlob], 'spikefit-badge.jpg', { type: 'image/jpeg' });
            const shareData = { files: [file], title: 'SpikeFit Workout Complete', text: textToShare };

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share(shareData);
                shareBtn.innerText = 'Shared!';
            } else {
                try {
                    if (navigator.clipboard && navigator.clipboard.write) {
                        await navigator.clipboard.write([new ClipboardItem({ 'image/jpeg': window.currentShareBlob })]);
                        shareBtn.innerText = 'Image Copied!';
                        showToast('Copied to Clipboard!', 'Badge copied! You can now paste it into an email or social app.', '📋', 6000);
                    } else {
                        throw new Error('Clipboard API unsupported');
                    }
                } catch (clipErr) {
                    const link  = document.createElement('a');
                    link.href   = URL.createObjectURL(window.currentShareBlob);
                    link.download = 'spikefit-badge.jpg';
                    link.click();
                    shareBtn.innerText = 'Downloaded!';
                }
            }
        } else {
            if (navigator.share) {
                await navigator.share({ title: 'SpikeFit Workout Complete', text: textToShare });
                shareBtn.innerText = 'Text Shared!';
            }
        }
    } catch (err) {
        console.error('Share failed:', err);
        if (err.name !== 'AbortError') shareBtn.innerText = 'Share Canceled';
    }

    setTimeout(() => { shareBtn.innerText = origTxt; }, 3000);
}

function closeBadgeModal() {
    document.getElementById('badge-modal').style.display = 'none';
    setTimeout(() => { showToast('Time to Refuel!', "Don't forget to grab a protein shake or a healthy snack for recovery.", '🥤'); }, 400);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(title, text, icon = '🥤', duration = 8000) {
    document.getElementById('toast-icon').innerText  = icon;
    document.getElementById('toast-title').innerText = title;
    document.getElementById('toast-text').innerText  = text;

    const toast = document.getElementById('app-toast');
    toast.classList.add('show');

    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(closeToast, duration);
}

function closeToast() {
    document.getElementById('app-toast').classList.remove('show');
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function openDisclaimerModal()  { document.getElementById('disclaimer-modal').style.display = 'flex'; }
function acceptDisclaimer()     { localStorage.setItem('disclaimerAgreed', 'true'); document.getElementById('disclaimer-modal').style.display = 'none'; setTimeout(checkStreak, 500); }
function openPrivacyModal()     { document.getElementById('privacy-modal').style.display = 'flex'; }
function closePrivacyModal()    { document.getElementById('privacy-modal').style.display = 'none'; }

// ─── Render Functions ─────────────────────────────────────────────────────────

function renderDaily() {
    const content        = document.getElementById('workout-content');
    const dayData        = schedule[currentDayIndex];
    const baseWorkoutKey = dayData.workout;
    const workoutKey     = getWorkoutKey(baseWorkoutKey);
    const workout        = workouts[workoutKey];

    if (!workout) {
        document.getElementById('current-workout-title').innerText = 'Active Recovery / Cardio';
        content.innerHTML = `<div style="text-align:center; padding: 4em 0; background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-sm);">
            <h2 style="color:var(--text-main); border:none; margin-bottom: 0.5em; justify-content:center;">Rest or Run Day</h2>
            <p style="color:var(--text-muted)">Focus on cardio, stretching, and recovery.</p></div>`;
        document.getElementById('progress-container').style.display = 'none';
        return;
    }

    document.getElementById('current-workout-title').innerText = workout.name;

    const isStarted     = !!activeWorkoutStart;
    const disabledClass = isStarted ? '' : 'disabled';
    const disabledAttr  = isStarted ? '' : 'disabled';
    let html = '';

    const regulate = FRESH_SYSTEM.needsRegulation();

    // Show banner immediately if regulate is triggered (even before clicking start)
    if (regulate) {
        html += `<div style="background: rgba(255, 46, 147, 0.1); border: 1px solid var(--accent); padding: 1em; border-radius: var(--radius-sm); margin-bottom: 1.5em; text-align: center;">
                    <strong style="color: var(--accent);">F.R.E.S.H. Auto-Regulator Engaged</strong>
                    <p style="font-size: 0.85em; color: var(--text-main); margin-top: 0.5em;">Swapped heavy impacts for explosive alternatives to protect your joints today.</p>
                 </div>`;
    }

    workout.blocks.forEach(block => {
        html += `<div class="workout-section"><h2>${block.title}</h2>`;
        block.exercises.forEach(ex => {
            const isChecked      = completedExercises[ex.id] ? 'checked' : '';
            const completedClass = completedExercises[ex.id] ? 'completed' : '';
            
            // F.R.E.S.H. Swap Logic
            const displayEx = (regulate && ex.impact === 'high' && ex.alt) ? Object.assign({}, ex, ex.alt) : ex;
            const regulatedClass = (regulate && ex.impact === 'high' && ex.alt) ? 'fresh-regulated' : '';
            
            const videoLink      = displayEx.url ? displayEx.url : `https://www.youtube.com/results?search_query=${encodeURIComponent(displayEx.video + ' tutorial')}`;

            // data-id drives the delegation handler — no inline onclick needed
            html += `
                <div class="exercise-card ${completedClass} ${disabledClass} ${regulatedClass}" data-id="${ex.id}" style="${regulatedClass ? 'border-left: 4px solid var(--accent);' : ''}">
                    <div class="checkbox-container">
                        <input type="checkbox" ${isChecked} ${disabledAttr}>
                    </div>
                    <div class="exercise-info">
                        <span class="title">${displayEx.name}</span>
                        <span class="reps">${displayEx.reps}</span>
                        <p class="notes">${displayEx.notes}</p>
                        <a href="${videoLink}" target="_blank" class="video-link">Watch</a>
                    </div>
                </div>`;
        });
        html += `</div>`;
    });

    content.innerHTML = html;
    updateWorkoutStatus();
    updateProgressBar();
}

function renderSchedule() {
    const content = document.getElementById('schedule-content');
    let html = '';
    schedule.forEach((day, index) => {
        const isToday        = index === currentDayIndex ? 'today' : '';
        const baseWorkoutKey = day.workout;
        const workoutKey     = getWorkoutKey(baseWorkoutKey);
        const workoutName    = workouts[workoutKey] ? workouts[workoutKey].name : 'Rest / Cardio';

        // data-index drives the delegation handler — no inline onclick needed
        html += `<div class="calendar-day ${isToday}" data-index="${index}">
            <h3>${day.day} ${isToday ? '<span style="color:var(--accent); font-size:0.8em; margin-left:0.5em;">(Active)</span>' : ''}</h3>
            <p style="color: var(--text-muted); font-size: 0.9em; margin-top: 0.25em;">${workoutName}</p>
        </div>`;
    });
    content.innerHTML = html;
}

function renderHistoryCalendar() {
    const content    = document.getElementById('month-grid-content');
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const year  = historyCalDate.getFullYear();
    const month = historyCalDate.getMonth();

    document.getElementById('month-year-display').innerText      = `${monthNames[month]} ${year}`;
    document.getElementById('btn-next-month').disabled = (year >= 2026 && month >= 11);

    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '<div class="month-day-header">Sun</div><div class="month-day-header">Mon</div><div class="month-day-header">Tue</div><div class="month-day-header">Wed</div><div class="month-day-header">Thu</div><div class="month-day-header">Fri</div><div class="month-day-header">Sat</div>';
    for (let i = 0; i < firstDay; i++) html += `<div class="month-date empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const mStr      = String(month + 1).padStart(2, '0');
        const dStr      = String(d).padStart(2, '0');
        const dateStr   = `${year}-${mStr}-${dStr}`;
        const isCompleted = completedDates[dateStr] ? 'completed' : '';
        html += `<div class="month-date ${isCompleted}">${d}</div>`;
    }
    content.innerHTML = html;
}

function changeMonth(delta) {
    const newMonth  = historyCalDate.getMonth() + delta;
    const tempDate  = new Date(historyCalDate.getFullYear(), newMonth, 1);
    if (tempDate.getFullYear() > 2026) return;
    historyCalDate  = tempDate;
    renderHistoryCalendar();
}

function setLevel(level, auto = false) {
    workoutLevel = level;
    localStorage.setItem('workoutLevel', level);
    if (!auto) { manualLevelOverride = true; localStorage.setItem('manualLevelOverride', 'true'); }

    document.getElementById('btn-level-beginner').classList.toggle('active',     level === 'beginner');
    document.getElementById('btn-level-intermediate').classList.toggle('active', level === 'intermediate');
    document.getElementById('btn-level-advanced').classList.toggle('active',     level === 'advanced');

    renderDaily();
    renderSchedule();
}

// ─── Streak Check ─────────────────────────────────────────────────────────────

function checkStreak() {
    if (sessionStorage.getItem('welcomeToastShown')) return;
    sessionStorage.setItem('welcomeToastShown', 'true');

    const today    = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const dates    = Object.keys(completedDates).sort((a, b) => new Date(b) - new Date(a));
    if (dates.length === 0) return;

    let streak            = 0;
    let currentCheckDate  = new Date(today);
    currentCheckDate.setHours(0, 0, 0, 0);

    const latestWorkout  = new Date(dates[0] + 'T00:00:00');
    const daysSinceLast  = Math.floor((currentCheckDate - latestWorkout) / (1000 * 60 * 60 * 24));

    if (daysSinceLast >= 2) {
        showToast('👋 Welcome Back!', "Missed you the last few days, let's get a streak going!", '🔥', 10000);
        return;
    }

    for (let i = 0; i < 365; i++) {
        const checkStr = currentCheckDate.getFullYear() + '-' + String(currentCheckDate.getMonth() + 1).padStart(2, '0') + '-' + String(currentCheckDate.getDate()).padStart(2, '0');
        if (completedDates[checkStr]) {
            streak++;
            currentCheckDate.setDate(currentCheckDate.getDate() - 1);
        } else if (i === 0 && !completedDates[todayStr]) {
            currentCheckDate.setDate(currentCheckDate.getDate() - 1);
        } else {
            break;
        }
    }

    if (streak >= 2) {
        showToast('🔥 Hot Streak!', `Daaamn, ${streak} days in a row, keep it up!`, '💪', 10000);
    } else if (streak === 1 && daysSinceLast === 1) {
        showToast('💪 Keep the Momentum!', 'You logged a workout yesterday. Keep it going today!', '✨', 10000);
    }
}

function checkDisclaimer() {
    if (!localStorage.getItem('disclaimerAgreed')) {
        openDisclaimerModal();
    } else {
        setTimeout(checkStreak, 500);
    }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

// Nav — tab buttons use data-tab
document.getElementById('main-nav').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab) {
        switchTab(tab, btn);
    } else if (btn.id === 'btn-nav-fresh') {
        FRESH_SYSTEM.openDashboardModal();
    }
});

// F.R.E.S.H. Modals
const closeFreshBtn = document.getElementById('btn-close-fresh');
if (closeFreshBtn) closeFreshBtn.addEventListener('click', FRESH_SYSTEM.closeDashboardModal);

// Workout controls
document.getElementById('btn-start-workout').addEventListener('click', () => {
    if (!activeWorkoutStart) {
        // Reset slider state before opening
        document.getElementById('freshness-slider').value = 8;
        document.getElementById('freshness-val').innerText = '8';
        document.getElementById('fresh-readiness-modal').style.display = 'flex';
    }
});

document.getElementById('btn-save-readiness').addEventListener('click', () => {
    const freshnessScore = parseInt(document.getElementById('freshness-slider').value, 10);
    FRESH_SYSTEM.sessionState.jointFreshness = freshnessScore;
    document.getElementById('fresh-readiness-modal').style.display = 'none';
    startWorkout();
});

document.getElementById('btn-cancel-readiness').addEventListener('click', () => {
    document.getElementById('fresh-readiness-modal').style.display = 'none';
});

document.getElementById('btn-mark-complete').addEventListener('click', () => {
    if (activeWorkoutStart) {
        // Reset slider state before opening
        document.getElementById('rpe-slider').value = 7;
        document.getElementById('rpe-val').innerText = '7';
        document.getElementById('fresh-rpe-modal').style.display = 'flex';
    }
});

document.getElementById('btn-save-rpe').addEventListener('click', () => {
    const rpeScore = parseInt(document.getElementById('rpe-slider').value, 10);
    const today = new Date();
    
    // Calculate Duration (cap at 3 hours/180 mins to prevent runaway load data)
    const durationMins = Math.round((today - new Date(activeWorkoutStart)) / 60000);
    let finalDuration = durationMins > 0 ? durationMins : 45; 
    if (finalDuration > 180) finalDuration = 180;

    // FIX: Apply a readiness modifier so jointFreshness actually affects the stored load
    // (and therefore future ACWR calculations). Previously freshness was saved to the log
    // but calculateACWR() never read it — it had zero mathematical effect on the ratio.
    //
    // Scale: freshness 10 → modifier 0.75 (fresh body absorbs load well, 25% discount)
    //        freshness 5  → modifier 1.00 (neutral)
    //        freshness 1  → modifier 1.20 (fatigued body, 20% load premium)
    const readiness         = FRESH_SYSTEM.sessionState.jointFreshness || 8;
    const readinessModifier = 1 + (5 - readiness) / 20;
    const sessionLoad       = Math.round(rpeScore * finalDuration * readinessModifier);

    FRESH_SYSTEM.saveLog({
        timestamp: Date.now(),
        dateString: today.toISOString().split('T')[0],
        readiness: { jointFreshness: FRESH_SYSTEM.sessionState.jointFreshness || 8 },
        session: { durationMins: finalDuration, rpe: rpeScore, load: sessionLoad }
    });

    FRESH_SYSTEM.sessionState.jointFreshness = null;
    document.getElementById('fresh-rpe-modal').style.display = 'none';
    
    markWorkoutComplete();
});

document.getElementById('btn-reset-day').addEventListener('click',      resetDay);

// Level toggle
document.getElementById('btn-level-beginner').addEventListener('click',     () => setLevel('beginner'));
document.getElementById('btn-level-intermediate').addEventListener('click', () => setLevel('intermediate'));
document.getElementById('btn-level-advanced').addEventListener('click',     () => setLevel('advanced'));

// History calendar navigation
document.getElementById('btn-prev-month').addEventListener('click', () => changeMonth(-1));
document.getElementById('btn-next-month').addEventListener('click', () => changeMonth(1));

// Footer links
document.getElementById('link-footer-privacy').addEventListener('click',    e => { e.preventDefault(); openPrivacyModal(); });
document.getElementById('link-footer-disclaimer').addEventListener('click', e => { e.preventDefault(); openDisclaimerModal(); });

// Badge modal
document.getElementById('btn-share-badge').addEventListener('click',  shareBadge);
document.getElementById('btn-close-badge').addEventListener('click',  closeBadgeModal);

// Disclaimer modal
document.getElementById('btn-accept-disclaimer').addEventListener('click', acceptDisclaimer);

// Privacy modal
document.getElementById('btn-close-privacy').addEventListener('click', closePrivacyModal);

// Logo fallback — if local logo.png fails to load, fall back to the GitHub-hosted copy.
document.getElementById('splash-logo-img').addEventListener('error', function() {
    this.onerror = null;
    this.src = 'https://raw.githubusercontent.com/jfrappier/spikefit/refs/heads/main/logo.png';
}, { once: true });

// Header logo fallback
document.getElementById('header-logo-img').addEventListener('error', function() {
    this.onerror = null;
    this.src = 'https://raw.githubusercontent.com/jfrappier/spikefit/refs/heads/main/logo.png';
}, { once: true });

// Toast
document.getElementById('btn-close-toast').addEventListener('click', closeToast);

// Exercise card delegation — data-id on each card, video-link clicks pass through
document.getElementById('workout-content').addEventListener('click', e => {
    if (e.target.closest('.video-link')) return;
    const card = e.target.closest('.exercise-card');
    if (!card || card.classList.contains('disabled')) return;
    toggleExercise(card.dataset.id, card);
});

// Schedule day delegation — data-index on each day card
document.getElementById('schedule-content').addEventListener('click', e => {
    const day = e.target.closest('.calendar-day');
    if (!day) return;
    setWorkoutDay(Number(day.dataset.index));
});

// ─── Init ─────────────────────────────────────────────────────────────────────

document.getElementById('btn-level-beginner').classList.toggle('active',     workoutLevel === 'beginner');
document.getElementById('btn-level-intermediate').classList.toggle('active', workoutLevel === 'intermediate');
document.getElementById('btn-level-advanced').classList.toggle('active',     workoutLevel === 'advanced');

renderDaily();
renderSchedule();
renderHistoryCalendar();

// ─── Splash Screen ────────────────────────────────────────────────────────────

document.body.style.overflow = 'hidden';
const splashScreen   = document.getElementById('splash-screen');
const splashProgress = document.getElementById('splash-progress');
const splashText     = document.getElementById('splash-text');

let progress = 0;
const splashDuration = 3000;
const intervalTime   = 30;
const steps          = splashDuration / intervalTime;
const increment      = 100 / steps;

const splashInterval = setInterval(() => {
    progress += increment;
    splashProgress.style.width = `${progress}%`;

    if (progress > 30 && progress < 70) {
        splashText.innerText = "Building Today's Workout...";
    } else if (progress >= 70) {
        splashText.innerText = 'Ready To Crush It!';
    }

    if (progress >= 100) {
        clearInterval(splashInterval);
        setTimeout(() => {
            splashScreen.classList.add('hidden');
            document.body.style.overflow = '';
            setTimeout(checkDisclaimer, 600);
        }, 200);
    }
}, intervalTime);
