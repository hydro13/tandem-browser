import path from 'path';
import fs from 'fs';
import { tandemDir } from '../utils/paths';

export interface ClaroNoteAuth {
  token: string;
  user: {
    id: number;
    email: string;
    name?: string;
  };
  expiresAt?: number;
}

export interface ClaroNote {
  id: string;
  title: string;
  transcript: string;
  summary: string;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERROR';
  duration: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteResponse {
  note: { id: string };
  uploadUrl: string;
  key: string;
}

export class ClaroNoteManager {
  private authFile: string;
  private baseUrl = 'https://api.claronote.com';
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  
  constructor() {
    const baseDir = tandemDir();
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.authFile = path.join(baseDir, 'claronote-auth.json');
  }

  // ═══ Authentication ═══

  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.apiRequest('POST', '/auth/login', {
        email,
        password
      });

      if (response.token && response.user) {
        const auth: ClaroNoteAuth = {
          token: response.token,
          user: response.user,
          expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };
        
        fs.writeFileSync(this.authFile, JSON.stringify(auth, null, 2));
        return { success: true };
      } else {
        return { success: false, error: 'Invalid response format' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async logout(): Promise<void> {
    if (fs.existsSync(this.authFile)) {
      fs.unlinkSync(this.authFile);
    }
  }

  getAuth(): ClaroNoteAuth | null {
    try {
      if (!fs.existsSync(this.authFile)) return null;
      
      const auth: ClaroNoteAuth = JSON.parse(fs.readFileSync(this.authFile, 'utf-8'));
      
      // Check if token is expired
      if (auth.expiresAt && Date.now() > auth.expiresAt) {
        void this.logout();
        return null;
      }
      
      return auth;
    } catch {
      return null;
    }
  }

  async getMe(): Promise<any> {
    const auth = this.getAuth();
    if (!auth) throw new Error('Not authenticated');
    
    return await this.apiRequest('GET', '/auth/me', null, auth.token);
  }

  isAuthenticated(): boolean {
    return this.getAuth() !== null;
  }

  // ═══ Recording ═══

  async startRecording(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.isRecording) {
        return { success: false, error: 'Already recording' };
      }

      // The actual MediaRecorder will be handled by the renderer process
      // We just track the state here
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to start recording' 
      };
    }
  }

  async stopRecording(): Promise<{ success: boolean; noteId?: string; error?: string }> {
    try {
      if (!this.isRecording) {
        return { success: false, error: 'No active recording' };
      }

      const auth = this.getAuth();
      if (!auth) {
        return { success: false, error: 'Not authenticated' };
      }

      // Calculate duration
      const _duration = Math.round((Date.now() - this.recordingStartTime) / 1000);

      // Stop recording
      this.isRecording = false;
      
      // Return success - the actual upload will be handled by the renderer process
      // For now, we'll just return a placeholder
      return { success: true, noteId: 'pending' };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to stop recording' 
      };
    }
  }

  getRecordingStatus(): { 
    isRecording: boolean; 
    duration?: number; 
    startTime?: number; 
  } {
    return {
      isRecording: this.isRecording,
      duration: this.isRecording ? Math.round((Date.now() - this.recordingStartTime) / 1000) : undefined,
      startTime: this.recordingStartTime || undefined
    };
  }

  // ═══ Notes Management ═══

  async getNotes(limit: number = 10): Promise<ClaroNote[]> {
    const auth = this.getAuth();
    if (!auth) throw new Error('Not authenticated');
    
    const response = await this.apiRequest('GET', `/notes?limit=${limit}&sortBy=createdAt&sortOrder=desc`, null, auth.token);
    return response.data || response;
  }

  async getNote(noteId: string): Promise<ClaroNote> {
    const auth = this.getAuth();
    if (!auth) throw new Error('Not authenticated');
    
    return await this.apiRequest('GET', `/notes/${noteId}`, null, auth.token);
  }

  // ═══ Public Methods for Audio Upload ═══

  async uploadRecording(audioBuffer: Buffer, duration: number): Promise<string> {
    const auth = this.getAuth();
    if (!auth) throw new Error('Not authenticated');
    
    return this.uploadAudioBuffer(audioBuffer, duration, auth.token);
  }

  // ═══ Private Methods ═══

  private async uploadAudioBuffer(audioBuffer: Buffer, duration: number, token: string): Promise<string> {
    // Step 1: Create note
    const createResponse: CreateNoteResponse = await this.apiRequest('POST', '/notes', {
      contentType: 'audio/webm',
      sourceType: 'RECORDING',
      duration
    }, token);

    // Step 2: Upload to S3
    const uploadResponse = await fetch(createResponse.uploadUrl, {
      method: 'PUT',
      body: audioBuffer,
      headers: {
        'Content-Type': 'audio/webm'
      }
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload audio');
    }

    // Step 3: Mark as uploaded
    await this.apiRequest('POST', `/notes/${createResponse.note.id}/uploaded`, {
      key: createResponse.key
    }, token);

    return createResponse.note.id;
  }

  private async apiRequest(method: string, endpoint: string, body: any = null, token?: string): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Tandem Browser/1.0'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options: RequestInit = {
      method,
      headers
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
      } catch {
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  }
}