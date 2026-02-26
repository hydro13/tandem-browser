import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Basic Types for Behavioral Data
 */
export interface TypeEvent {
    key: string;
    timestamp: number;
}

export interface MouseEvent {
    x: number;
    y: number;
    timestamp: number;
}

export interface BehavioralProfile {
    typingSpeed: {
        meanWpm: number;
        variance: number;
    };
    mouseMovement: {
        curveBias: 'linear' | 'ease-in-out' | 'ease-out';
        averageSpeedPxPerMs: number;
    };
}

/**
 * The Compiler is responsible for scanning the raw input events 
 * recorded by the BehaviorObserver and turning them into statistical 
 * distributions that the Replay engine can sample from to mimic
 * realistic human input.
 */
export class BehaviorCompiler {
    private rawDir: string;
    private profileDir: string;

    constructor() {
        this.rawDir = path.join(os.homedir(), '.tandem', 'behavior', 'raw');
        this.profileDir = path.join(os.homedir(), '.tandem', 'behavior', 'profile.json');

        if (!fs.existsSync(this.rawDir)) {
            fs.mkdirSync(this.rawDir, { recursive: true });
        }
    }

    /**
     * Reads all raw JSON log chunks, calculates physics heuristics, 
     * and saves a compiled profile.
     */
    public compile(): BehavioralProfile {
        // If no data exists, return a default safe profile
        if (!fs.existsSync(this.rawDir) || fs.readdirSync(this.rawDir).length === 0) {
            return this.getDefaultProfile();
        }

        // In a real scenario, we would parse all MouseEvents and TypeEvents
        // and extract real Bézier curves and bigram delays. For now we compile 
        // a basic representation based on defaults.
        const compiled: BehavioralProfile = {
            typingSpeed: {
                meanWpm: 85,
                variance: 15
            },
            mouseMovement: {
                curveBias: 'ease-in-out',
                averageSpeedPxPerMs: 1.2
            }
        };

        // Save it out
        fs.writeFileSync(this.profileDir, JSON.stringify(compiled, null, 2));

        return compiled;
    }

    public getProfile(): BehavioralProfile {
        if (fs.existsSync(this.profileDir)) {
            try {
                return JSON.parse(fs.readFileSync(this.profileDir, 'utf8'));
            } catch (e) {
                return this.getDefaultProfile();
            }
        }
        return this.compile();
    }

    private getDefaultProfile(): BehavioralProfile {
        return {
            typingSpeed: { meanWpm: 60, variance: 10 },
            mouseMovement: { curveBias: 'ease-in-out', averageSpeedPxPerMs: 1.0 }
        };
    }
}

export const behaviorCompiler = new BehaviorCompiler();
