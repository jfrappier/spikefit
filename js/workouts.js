const workouts = {
    'A': {
        name: 'Workout A: Vertical Power',
        blocks: [
            {
                title: 'Warm-Up (No Rest)',
                exercises: [
                    { id: 'aw1', name: 'Leg Swings', reps: '10 reps / leg', notes: 'Hold a wall for balance. Swing leg forward and back to loosen hips.', video: 'Leg Swings exercise' },
                    { id: 'aw2', name: 'Hip Circles', reps: '10 reps / leg', notes: 'Stand on one leg, draw large circles with the raised knee. Opens the hip joint.', video: 'Hip Circles exercise' },
                    { id: 'aw3', name: 'Squat to Stand', reps: '10 reps', notes: 'Hinge to touch toes, drop into a deep squat, stand. Slow and deliberate.', video: 'Squat to Stand exercise' },
                    { id: 'aw4', name: 'Glute Bridge', reps: '15 reps', notes: 'Bodyweight only. Activate glutes before jumping.', video: 'Glute Bridge exercise' },
                    { id: 'aw5', name: 'Ankle Bounces', reps: '30 seconds', notes: 'Small, fast bounces. Stiffen ankles — don\'t let them collapse.', video: 'Ankle Bounces warm-up' }
                ]
            },
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
                    { id: 'a4', name: 'Dead Bugs', reps: '10 reps / side', notes: 'Lower back glued to floor.', video: 'Dead Bug exercise' },
                    { id: 'a5', name: 'Goblet Squat', reps: '10 reps', notes: 'Hold DB at chest, sit into hips, drive through heels.', video: 'Goblet Squat' },
                    { id: 'a6', name: 'Glute Bridge', reps: '15 reps', notes: 'Squeeze glutes at top, drive hips up through heels.', video: 'Glute Bridge' }
                ]
            }
        ]
    },
    'A2': {
        name: 'Workout A: Vertical Power (Intermediate)',
        blocks: [
            {
                title: 'Warm-Up (No Rest)',
                exercises: [
                    { id: 'a2-w1', name: 'Leg Swings', reps: '10 reps / leg', notes: 'Hold a wall for balance. Swing leg forward and back to loosen hips.', video: 'Leg Swings exercise' },
                    { id: 'a2-w2', name: 'Hip Circles', reps: '10 reps / leg', notes: 'Stand on one leg, draw large circles with the raised knee. Opens the hip joint.', video: 'Hip Circles exercise' },
                    { id: 'a2-w3', name: 'Squat to Stand', reps: '10 reps', notes: 'Hinge to touch toes, drop into a deep squat, stand. Slow and deliberate.', video: 'Squat to Stand exercise' },
                    { id: 'a2-w4', name: 'Single-Leg Glute Bridge', reps: '8 reps / side', notes: 'Bodyweight. Press through heel, keep hips level. Builds single-leg stability for landing.', video: 'Single Leg Glute Bridge' },
                    { id: 'a2-w5', name: 'Lateral Leg Swings', reps: '10 reps / leg', notes: 'Swing leg side to side across your body. Opens hip abductors for lateral movement.', video: 'Lateral Leg Swings exercise' },
                    { id: 'a2-w6', name: 'Ankle Bounces', reps: '30 seconds', notes: 'Small, fast bounces. Stiffen ankles — don\'t let them collapse.', video: 'Ankle Bounces warm-up' }
                ]
            },
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
                title: 'Warm-Up (No Rest)',
                exercises: [
                    { id: 'bw1', name: 'Arm Circles', reps: '30 seconds each direction', notes: 'Full range, forward then back. Loosens the shoulder capsule.', video: 'Arm Circles warm-up' },
                    { id: 'bw2', name: 'Shoulder Pendulum', reps: '30 seconds / arm', notes: 'Lean forward on a table, let arm hang and swing freely. Decompresses the shoulder.', video: 'Shoulder Pendulum exercise' },
                    { id: 'bw3', name: 'Cat-Cow', reps: '10 reps', notes: 'Slow thoracic flexion and extension. Mobilizes the upper back for pressing and pulling.', video: 'Cat Cow exercise' },
                    { id: 'bw4', name: 'Wall Slides', reps: '10 reps', notes: 'Arms in goalpost position against wall, slide up. Keep full contact throughout.', video: 'Wall Slides shoulder' }
                ]
            },
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
            },
            {
                title: 'Shoulder Health (2 Rounds - Rest 30s)',
                exercises: [
                    { id: 'b5', name: 'Band Pull-Aparts', reps: '15 reps', notes: 'Arms straight, pull band apart at chest height. Squeeze shoulder blades.', video: 'Band Pull Apart exercise' }
                ]
            }
        ]
    },
    'B2': {
        name: 'Workout B: Upper Body Armor (Intermediate)',
        blocks: [
            {
                title: 'Warm-Up (No Rest)',
                exercises: [
                    { id: 'b2-w1', name: 'Arm Circles', reps: '30 seconds each direction', notes: 'Full range, forward then back. Loosens the shoulder capsule.', video: 'Arm Circles warm-up' },
                    { id: 'b2-w2', name: 'Shoulder Pendulum', reps: '30 seconds / arm', notes: 'Lean forward on a table, let arm hang and swing freely. Decompresses the shoulder.', video: 'Shoulder Pendulum exercise' },
                    { id: 'b2-w3', name: 'Cat-Cow', reps: '10 reps', notes: 'Slow thoracic flexion and extension. Mobilizes the upper back for pressing and pulling.', video: 'Cat Cow exercise' },
                    { id: 'b2-w4', name: 'Wall Slides', reps: '10 reps', notes: 'Arms in goalpost position against wall, slide up. Keep full contact throughout.', video: 'Wall Slides shoulder' },
                    { id: 'b2-w5', name: 'Thoracic Rotation', reps: '10 reps / side', notes: 'Hands behind head, rotate torso fully each side. Keep hips square.', video: 'Thoracic Rotation exercise' }
                ]
            },
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
            },
            {
                title: 'Shoulder Health (2 Rounds - Rest 30s)',
                exercises: [
                    { id: 'b2-7', name: 'Band Pull-Aparts', reps: '15 reps', notes: 'Arms straight, pull band apart at chest height. Squeeze shoulder blades.', video: 'Band Pull Apart exercise' },
                    { id: 'b2-8', name: 'Side-Lying DB External Rotation', reps: '12 reps / side', notes: 'Elbow pinned to side, rotate forearm up. Light weight only.', video: 'Side Lying External Rotation' }
                ]
            }
        ]
    },
    'C': {
        name: 'Workout C: Defense Agility',
        blocks: [
            {
                title: 'Warm-Up (3 Rounds - No Rest)',
                exercises: [
                    { id: 'cw3', name: 'Lateral Shuffles', reps: '30 seconds', notes: 'Quick side-to-side shuffle steps in a low defensive stance. Stay light on your feet.', video: 'Lateral Shuffle volleyball drill' },
                    { id: 'cw1', name: 'W-Drill', reps: '2 reps', notes: 'Shuffle right, sprint to center, shuffle left, backpedal, repeat. Moderate pace — focus on the footwork pattern.', video: 'W Drill agility volleyball' },
                    { id: 'cw2', name: 'Fast-Feet Taps', reps: '30 seconds', notes: 'Quick alternating foot taps over a line or low object. Controlled pace.', video: 'Fast Feet Taps drill' }
                ]
            },
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
                title: 'Warm-Up (3 Rounds - No Rest)',
                exercises: [
                    { id: 'c2-w3', name: 'Lateral Shuffles', reps: '30 seconds', notes: 'Quick side-to-side shuffle steps in a low defensive stance. Push your pace.', video: 'Lateral Shuffle volleyball drill' },
                    { id: 'c2-w1', name: 'W-Drill', reps: '2 reps', notes: 'Shuffle right, sprint to center, shuffle left, backpedal, repeat. Increase speed each round.', video: 'W Drill agility volleyball' },
                    { id: 'c2-w2', name: 'Fast-Feet Taps', reps: '30 seconds', notes: 'Quick alternating foot taps over a line or low object. Push your pace.', video: 'Fast Feet Taps drill' }
                ]
            },
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
                title: 'Warm-Up (No Rest)',
                exercises: [
                    { id: 'dw1', name: 'Cat-Cow', reps: '10 reps', notes: 'Slow thoracic flexion and extension. Mobilizes the spine for rotation.', video: 'Cat Cow exercise' },
                    { id: 'dw2', name: 'Kneeling Hip Flexor Stretch', reps: '30 seconds / side', notes: 'Low lunge, push hips forward. Frees the swing hip and counters sitting.', video: 'Kneeling Hip Flexor Stretch' },
                    { id: 'dw3', name: 'Hip Circles', reps: '10 reps / leg', notes: 'Stand on one leg, draw large circles with the raised knee. Opens hips for approach footwork.', video: 'Hip Circles exercise' },
                    { id: 'dw4', name: 'Cross-Body Arm Swings', reps: '20 reps', notes: 'Swing arms across chest then open wide. Warms up the shoulder and chest for arm swing.', video: 'Cross Body Arm Swings' },
                    { id: 'dw5', name: 'Seated Torso Rotation', reps: '10 reps / side', notes: 'Sit cross-legged, rotate torso fully each side. Primes the rotational pattern for swing mechanics.', video: 'Seated Torso Rotation' }
                ]
            },
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
                    { id: 'd4', name: 'Half-Kneeling Swings (Left Knee Up)', reps: '10 reps', notes: 'Left knee bent, right knee on floor. Focus on elbow draw and torque.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' },
                    { id: 'd5', name: 'Half-Kneeling Swings (Right Knee Up)', reps: '10 reps', notes: 'Right knee bent, left knee on floor. Maintain high elbow.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' },
                    { id: 'd6', name: 'Tall Kneeling Swings', reps: '10 reps', notes: 'Both knees on floor. Engage core to snap through the swing.', video: 'Swing Mechanics', url: 'https://www.youtube.com/watch?v=X2TLr7aLors' }
                ]
            }
        ]
    },
    'D2': {
        name: 'Workout D: Core & Swing Mechanics (Intermediate)',
        blocks: [
            {
                title: 'Warm-Up (No Rest)',
                exercises: [
                    { id: 'd2-w1', name: 'Cat-Cow', reps: '10 reps', notes: 'Slow thoracic flexion and extension. Mobilizes the spine for rotation.', video: 'Cat Cow exercise' },
                    { id: 'd2-w2', name: 'Kneeling Hip Flexor Stretch', reps: '30 seconds / side', notes: 'Low lunge, push hips forward. Frees the swing hip and counters sitting.', video: 'Kneeling Hip Flexor Stretch' },
                    { id: 'd2-w3', name: 'Hip Circles', reps: '10 reps / leg', notes: 'Stand on one leg, draw large circles with the raised knee. Opens hips for approach footwork.', video: 'Hip Circles exercise' },
                    { id: 'd2-w4', name: 'Cross-Body Arm Swings', reps: '20 reps', notes: 'Swing arms across chest then open wide. Warms up the shoulder and chest for arm swing.', video: 'Cross Body Arm Swings' },
                    { id: 'd2-w5', name: 'Thoracic Rotation', reps: '10 reps / side', notes: 'Hands behind head, rotate torso fully each side. Unlocks the upper back for arm swing power.', video: 'Thoracic Rotation exercise' },
                    { id: 'd2-w6', name: 'Seated Torso Rotation', reps: '12 reps / side', notes: 'Sit cross-legged, rotate torso fully each side. Primes the rotational pattern for swing mechanics.', video: 'Seated Torso Rotation' }
                ]
            },
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
                title: 'Warm-Up (No Rest)',
                exercises: [
                    { id: 'a3-w1', name: 'Leg Swings', reps: '12 reps / leg', notes: 'Hold a wall for balance. Swing leg forward and back to loosen hips.', video: 'Leg Swings exercise' },
                    { id: 'a3-w2', name: 'Hip Circles', reps: '12 reps / leg', notes: 'Stand on one leg, draw large circles with the raised knee. Opens the hip joint.', video: 'Hip Circles exercise' },
                    { id: 'a3-w3', name: 'Squat to Stand', reps: '12 reps', notes: 'Hinge to touch toes, drop into a deep squat, stand. Slow and deliberate.', video: 'Squat to Stand exercise' },
                    { id: 'a3-w4', name: 'Single-Leg Glute Bridge', reps: '10 reps / side', notes: 'Bodyweight. Press through heel, keep hips level.', video: 'Single Leg Glute Bridge' },
                    { id: 'a3-w5', name: 'Lateral Leg Swings', reps: '12 reps / leg', notes: 'Swing leg side to side across your body. Opens hip abductors for lateral movement.', video: 'Lateral Leg Swings exercise' },
                    { id: 'a3-w6', name: 'Reactive Ankle Hops', reps: '30 seconds', notes: 'Small lateral hops, alternating feet. React fast off the floor — minimal ground contact.', video: 'Reactive Ankle Hops' }
                ]
            },
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
                title: 'Warm-Up (No Rest)',
                exercises: [
                    { id: 'b3-w1', name: 'Arm Circles', reps: '30 seconds each direction', notes: 'Full range, forward then back. Loosens the shoulder capsule.', video: 'Arm Circles warm-up' },
                    { id: 'b3-w2', name: 'Shoulder Pendulum', reps: '30 seconds / arm', notes: 'Lean forward on a table, let arm hang and swing freely. Decompresses the shoulder.', video: 'Shoulder Pendulum exercise' },
                    { id: 'b3-w3', name: 'Cat-Cow', reps: '10 reps', notes: 'Slow thoracic flexion and extension. Mobilizes the upper back for pressing and pulling.', video: 'Cat Cow exercise' },
                    { id: 'b3-w4', name: 'Wall Slides', reps: '12 reps', notes: 'Arms in goalpost position against wall, slide up. Keep full contact throughout.', video: 'Wall Slides shoulder' },
                    { id: 'b3-w5', name: 'Thoracic Rotation', reps: '12 reps / side', notes: 'Hands behind head, rotate torso fully each side. Keep hips square.', video: 'Thoracic Rotation exercise' },
                    { id: 'b3-w6', name: 'Scapular Push-Ups', reps: '10 reps', notes: 'In push-up position, retract and protract shoulder blades only — arms stay straight. Activates serratus anterior.', video: 'Scapular Push Ups' }
                ]
            },
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
            },
            {
                title: 'Shoulder Health (2 Rounds - Rest 30s)',
                exercises: [
                    { id: 'b3-10', name: 'Face Pulls (Band)', reps: '15 reps', notes: 'Pull to forehead level, flare elbows out. External rotation at end range.', video: 'Face Pull exercise band' },
                    { id: 'b3-11', name: 'Side-Lying DB External Rotation', reps: '15 reps / side', notes: 'Elbow pinned to side, rotate forearm up. Light weight only.', video: 'Side Lying External Rotation' }
                ]
            }
        ]
    },
    'C3': {
        name: 'Workout C: Defense Agility (Advanced)',
        blocks: [
            {
                title: 'Warm-Up (3 Rounds - No Rest)',
                exercises: [
                    { id: 'c3-w4', name: 'Lateral Shuffles', reps: '30 seconds', notes: 'Quick side-to-side shuffle steps in a low defensive stance. Max speed.', video: 'Lateral Shuffle volleyball drill' },
                    { id: 'c3-w1', name: 'W-Drill', reps: '2 reps', notes: 'Shuffle right, sprint to center, shuffle left, backpedal, repeat. Max speed — explosive direction changes.', video: 'W Drill agility volleyball' },
                    { id: 'c3-w2', name: 'Fast-Feet Taps', reps: '30 seconds', notes: 'Max speed foot taps. Drive through the balls of your feet.', video: 'Fast Feet Taps drill' },
                    { id: 'c3-w3', name: 'Shuffle-to-Freeze', reps: '30 seconds', notes: 'Lateral shuffle — stop and hold a defensive stance on your own cue. Builds reactive deceleration.', video: 'Defensive Shuffle volleyball drill' }
                ]
            },
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
                title: 'Warm-Up (No Rest)',
                exercises: [
                    { id: 'd3-w1', name: 'Cat-Cow', reps: '10 reps', notes: 'Slow thoracic flexion and extension. Mobilizes the spine for rotation.', video: 'Cat Cow exercise' },
                    { id: 'd3-w2', name: 'Kneeling Hip Flexor Stretch', reps: '30 seconds / side', notes: 'Low lunge, push hips forward. Frees the swing hip and counters sitting.', video: 'Kneeling Hip Flexor Stretch' },
                    { id: 'd3-w3', name: 'Hip Circles', reps: '12 reps / leg', notes: 'Stand on one leg, draw large circles with the raised knee. Opens hips for approach footwork.', video: 'Hip Circles exercise' },
                    { id: 'd3-w4', name: 'Cross-Body Arm Swings', reps: '25 reps', notes: 'Swing arms across chest then open wide. Warms up the shoulder and chest for arm swing.', video: 'Cross Body Arm Swings' },
                    { id: 'd3-w5', name: 'Thoracic Rotation', reps: '12 reps / side', notes: 'Hands behind head, rotate torso fully each side. Unlocks the upper back for arm swing power.', video: 'Thoracic Rotation exercise' },
                    { id: 'd3-w6', name: 'World\'s Greatest Stretch', reps: '5 reps / side', notes: 'Lunge forward, plant hand, reach arm to sky and rotate. Full-body mobility for dynamic approach.', video: 'World\'s Greatest Stretch' },
                    { id: 'd3-w7', name: 'Seated Torso Rotation', reps: '15 reps / side', notes: 'Sit cross-legged, rotate torso fully each side. Primes the rotational pattern for swing mechanics.', video: 'Seated Torso Rotation' }
                ]
            },
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
