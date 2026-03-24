import { handleCommand } from './AIAssistant'
class VIM {
  constructor(){this.rec=null;this.isListening=false;this.onTranscript=null;this.onStateChange=null;this.supported=false;this._init()}
  _init(){const S=window.SpeechRecognition||window.webkitSpeechRecognition;if(!S)return;this.supported=true;this.rec=new S();this.rec.continuous=true;this.rec.interimResults=true;this.rec.lang='en-IN'
    this.rec.onresult=e=>{let f='',i='';for(let j=e.resultIndex;j<e.results.length;j++){if(e.results[j].isFinal)f+=e.results[j][0].transcript;else i+=e.results[j][0].transcript}
      if(i&&this.onTranscript)this.onTranscript(i,false);if(f){this.onTranscript?.(f,true);this._proc(f)}}
    this.rec.onerror=e=>{if(e.error!=='no-speech')setTimeout(()=>this.isListening&&this.start(),1000)}
    this.rec.onend=()=>{if(this.isListening)try{this.rec.start()}catch(e){}}
  }
  _proc(t){let c=t.trim().toLowerCase();for(const w of['indra','captain','computer']){if(c.startsWith(w)){c=c.slice(w.length).replace(/^[,.\s]+/,'');break}};if(c.length>2)handleCommand(c)}
  start(){if(!this.supported||this.isListening)return;try{this.rec.start();this.isListening=true;this.onStateChange?.(true)}catch(e){}}
  stop(){if(!this.supported)return;this.isListening=false;this.rec.stop();this.onStateChange?.(false)}
  toggle(){this.isListening?this.stop():this.start()}
}
export const voiceInput = new VIM()
