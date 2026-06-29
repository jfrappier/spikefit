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
