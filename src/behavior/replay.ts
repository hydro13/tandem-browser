import type { BehavioralProfile } from './compiler';
import { behaviorCompiler } from './compiler';

export class BehaviorReplay {
    private profile: BehavioralProfile;

    constructor() {
        this.profile = behaviorCompiler.getProfile();
    }

    /**
     * Reloads the profile from disk (e.g., if the compiler just ran)
     */
    public refreshProfile() {
        this.profile = behaviorCompiler.getProfile();
    }

    /**
     * Calculates the delay (in milliseconds) before typing the next character,
     * based on the user's average WPM.
     */
    public getTypingDelay(_currentChar: string, _nextChar: string): number {
        const wpm = this.profile.typingSpeed.meanWpm;
        // Average word is ~5 characters. WPM * 5 = CPM.
        const cpm = wpm * 5;
        const msPerChar = 60000 / cpm; // e.g. 60000 / 300 = 200ms

        // Add some Gaussian noise based on the variance
        const variance = this.profile.typingSpeed.variance;
        const noise = (Math.random() * variance * 2) - variance; // +/- variance

        return Math.max(10, msPerChar + noise);
    }

    /**
     * Calculates a list of intermediate points and delays to smoothly move the mouse 
     * from (startX, startY) to (endX, endY) mimicking human bézier curves.
     */
    public getMouseTrajectory(startX: number, startY: number, endX: number, endY: number): { x: number, y: number, delayMs: number }[] {
        const distance = Math.hypot(endX - startX, endY - startY);
        const speed = this.profile.mouseMovement.averageSpeedPxPerMs;
        const totalTimeMs = distance / speed;

        const points = [];
        const steps = Math.max(5, Math.min(50, Math.floor(distance / 10))); // Adaptive resolution

        // Simple linear interpolation with ease-in-out for now
        // A full implementation would use a cubic bézier curve based on the profile
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;

            // Apply easing based on profile
            let easedT = t;
            if (this.profile.mouseMovement.curveBias === 'ease-in-out') {
                easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            }

            const x = startX + (endX - startX) * easedT;
            const y = startY + (endY - startY) * easedT;
            const delayMs = totalTimeMs / steps;

            points.push({ x: Math.round(x), y: Math.round(y), delayMs: Math.round(delayMs) });
        }

        return points;
    }
}

export const behaviorReplay = new BehaviorReplay();
