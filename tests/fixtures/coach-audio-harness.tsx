import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {CoachVoice} from '../../src/coach-voice';
import {CoachSession} from '../../src/coach-session';
export function mount(kind: string) {
 const node=document.createElement('div');document.body.replaceChildren(node);
 createRoot(node).render(<MemoryRouter>{kind==='lesson'?<CoachSession planId="audio-audit"/>:<CoachVoice planId="audio-audit" onComplete={()=>{}}/>}</MemoryRouter>);
}
