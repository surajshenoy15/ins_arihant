import React,{useState,useEffect,useRef,useCallback} from 'react'
import{useGameStore,LIGHT_MODES,SCENES,VIEW_MODES}from'../../stores/gameStore'
import{handleCommand,indraVoice,speakReactive,runSceneDialogue}from'../../systems/AIAssistant'
import{voiceInput}from'../../systems/VoiceInput'
import{submarineAudio}from'../../systems/AudioManager'
import PeriscopeOverlay from '../Interior/PeriscopeOverlay'
import QuestHUD, { IS_TOUCH } from './QuestHUD'

function AIDialogue(){
  const msgs=useGameStore(s=>s.aiMessages);const ref=useRef()
  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight},[msgs])
  const pc={normal:'#00e5ff',info:'#78909c',warning:'#FF9933',critical:'#ff1744'}
  return<div style={{position:'absolute',top:16,left:16,width:360,maxHeight:220,background:'rgba(0,4,16,0.9)',border:'1px solid rgba(0,229,255,0.12)',borderRadius:4,backdropFilter:'blur(8px)',overflow:'hidden'}}>
    <div style={{padding:'5px 10px',borderBottom:'1px solid rgba(0,229,255,0.08)',display:'flex',alignItems:'center',gap:8,fontSize:10,fontFamily:'var(--font-display)',color:'#00e5ff',letterSpacing:2}}>
      <div style={{width:5,height:5,borderRadius:'50%',background:'#00e676',boxShadow:'0 0 5px #00e676',animation:'pulse-glow 2s infinite'}}/>
      INDRA — COMBAT ADVISOR
      <div style={{marginLeft:'auto',display:'flex',gap:2}}>
        <div style={{width:8,height:3,background:'#FF9933',borderRadius:1}}/>
        <div style={{width:8,height:3,background:'#FFF',borderRadius:1}}/>
        <div style={{width:8,height:3,background:'#138808',borderRadius:1}}/>
      </div>
    </div>
    <div ref={ref} style={{padding:'6px 10px',maxHeight:175,overflowY:'auto',fontSize:11,fontFamily:'var(--font-mono)',lineHeight:1.6}}>
      {msgs.slice(-15).map(m=><div key={m.id} style={{color:pc[m.priority]||'#b0bec5',marginBottom:5,animation:'fadeIn 0.4s forwards',opacity:0}}>
        <span style={{color:'rgba(0,229,255,0.3)',marginRight:5}}>[{new Date(m.timestamp).toLocaleTimeString('en-US',{hour12:false})}]</span>
        {String(m.text)}
      </div>)}
    </div>
  </div>
}

function StatusBar(){
  const d=useGameStore(s=>s.depth),h=useGameStore(s=>s.hullIntegrity),o2=useGameStore(s=>s.oxygenLevel),rx=useGameStore(s=>s.reactorTemp),hd=useGameStore(s=>s.heading),sp=useGameStore(s=>s.speed),mt=useGameStore(s=>s.missionTime)
  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`
  const I=({l,v,u='',w=false})=><div style={{display:'flex',justifyContent:'space-between',padding:'2px 0',fontSize:10,fontFamily:'var(--font-mono)'}}><span style={{color:'rgba(176,190,197,0.5)',letterSpacing:1}}>{l}</span><span style={{color:w?'#ff1744':'#00e5ff',fontWeight:600}}>{v}{u}</span></div>
  return<div style={{position:'absolute',top:16,right:16,width:190,background:'rgba(0,4,16,0.9)',border:'1px solid rgba(0,229,255,0.1)',borderRadius:4,padding:'8px 12px',backdropFilter:'blur(8px)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:9,fontFamily:'var(--font-display)',color:'#00e5ff',letterSpacing:2,marginBottom:6,paddingBottom:5,borderBottom:'1px solid rgba(0,229,255,0.08)'}}>
      <span>INS ARIHANT</span><span style={{color:'#FF9933'}}>S73</span>
    </div>
    <I l="DEPTH" v={Math.abs(d).toFixed(0)} u="m"/>
    <I l="SPEED" v={sp.toFixed(0)} u="kts"/>
    <I l="HEADING" v={hd.toFixed(0)+'°'}/>
    <I l="HULL" v={h.toFixed(0)} u="%" w={h<60}/>
    <I l="O₂" v={o2.toFixed(0)} u="%"/>
    <I l="REACTOR" v={rx.toFixed(0)} u="°K" w={rx>500}/>
    <I l="MISSION" v={fmt(mt)}/>
    <div style={{marginTop:6,height:3,background:'rgba(0,0,0,0.4)',borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:`${h}%`,background:h>60?'#00e5ff':h>30?'#ff6d00':'#ff1744',borderRadius:2,transition:'width 0.5s'}}/></div>
  </div>
}

function WeaponsPanel(){
  const tc=useGameStore(s=>s.torpedoCount),bm=useGameStore(s=>s.brahmosMissiles),dc=useGameStore(s=>s.decoyCount)
  const ft=useGameStore(s=>s.fireTorpedo),fb=useGameStore(s=>s.fireBrahMos),dd=useGameStore(s=>s.deployDecoy)
  const contacts=useGameStore(s=>s.contacts),tif=useGameStore(s=>s.torpedoInFlight),bif=useGameStore(s=>s.brahmoInFlight)
  const periscopeMode=useGameStore(s=>s.periscopeMode)
  // Hide on Quest (QuestHUD weapons tab handles this) and periscope mode
  if(periscopeMode||IS_TOUCH) return null
  const fireT=()=>{const t=contacts.find(c=>c.hostile&&c.tracked)||contacts.find(c=>c.hostile);if(t&&tc>0){ft(t.id);submarineAudio.playTorpedoLaunch();speakReactive('torpedoFired')}else{indraVoice.speak(tc<=0?"Tubes empty.":"No target. Press R to track.",'warning')}}
  const fireB=()=>{const t=contacts.find(c=>c.hostile&&c.tracked)||contacts.find(c=>c.hostile);if(t&&bm>0){fb(t.id);submarineAudio.playMissileLaunch();speakReactive('brahmosFired')}else{indraVoice.speak(bm<=0?"BrahMos empty.":"No target.",'warning')}}
  const Btn=({label,count,max,onClick,color,active,sub})=><button onClick={()=>{onClick();submarineAudio.playClick()}} style={{width:'100%',padding:'8px 10px',background:active?color+'25':'rgba(0,4,16,0.8)',border:'1px solid '+(count>0?color:'rgba(255,255,255,0.05)'),borderRadius:4,cursor:count>0?'pointer':'not-allowed',transition:'all 0.15s',textAlign:'left',opacity:count>0?1:0.4}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <div style={{fontFamily:'var(--font-display)',fontSize:9,color:color,letterSpacing:2}}>{label}</div>
        {sub&&<div style={{fontFamily:'var(--font-mono)',fontSize:7,color:'rgba(176,190,197,0.3)',marginTop:1}}>{sub}</div>}
      </div>
      <div style={{fontFamily:'var(--font-display)',fontSize:14,color:color,fontWeight:700}}>{count}</div>
    </div>
    <div style={{display:'flex',gap:2,marginTop:4}}>{Array.from({length:max},(_,i)=><div key={i} style={{flex:1,height:3,borderRadius:1,background:i<count?color:'rgba(255,255,255,0.05)',transition:'background 0.3s'}}/>)}</div>
  </button>
  return<div style={{position:'absolute',top:250,right:16,width:180,display:'flex',flexDirection:'column',gap:5}}>
    <div style={{fontFamily:'var(--font-display)',fontSize:8,color:'#ff1744',letterSpacing:3,textAlign:'center',padding:'4px 0'}}>WEAPONS</div>
    <Btn label="TORPEDO 533mm" count={tc} max={6} onClick={fireT} color="#ff1744" active={!!tif} sub="Heavyweight • Wire-guided"/>
    <Btn label="BRAHMOS" count={bm} max={4} onClick={fireB} color="#FF9933" active={!!bif} sub="Mach 2.8 • Cruise missile"/>
    <Btn label="DECOY" count={dc} max={8} onClick={()=>{if(dc>0){dd();speakReactive('decoyDeploy')}}} color="#00e5ff" sub="Acoustic countermeasure"/>
  </div>
}

function QuickActions(){
  const store=useGameStore()
  const periscopeMode=useGameStore(s=>s.periscopeMode)
  const viewMode=useGameStore(s=>s.viewMode)
  const isInterior = viewMode === VIEW_MODES.INTERIOR || viewMode === 'interior'
  // Hide on Quest (QuestHUD handles all of this) and periscope mode
  if(periscopeMode||IS_TOUCH) return null
  const B=({label,onClick,color='#00e5ff',active=false})=><button onClick={()=>{onClick();submarineAudio.playSwitch()}} style={{padding:'5px 10px',background:active?color+'20':'rgba(0,4,16,0.8)',border:'1px solid '+(active?color:'rgba(0,229,255,0.15)'),borderRadius:3,color:active?color:'#b0bec5',fontFamily:'var(--font-mono)',fontSize:8,letterSpacing:1,cursor:'pointer',transition:'all 0.15s',textTransform:'uppercase',width:'100%'}}>{label}</button>
  return<div style={{position:'absolute',top:250,left:16,width:120,display:'flex',flexDirection:'column',gap:3}}>
    <div style={{fontFamily:'var(--font-display)',fontSize:8,color:'#00e5ff',letterSpacing:3,textAlign:'center',padding:'4px 0'}}>SYSTEMS</div>
    <B label="Stealth" onClick={()=>{store.setLightMode(LIGHT_MODES.STEALTH);speakReactive('lightChange',LIGHT_MODES.STEALTH)}} active={store.lightMode===LIGHT_MODES.STEALTH} color="#1b5e20"/>
    <B label="Combat" onClick={()=>{store.setLightMode(LIGHT_MODES.COMBAT);speakReactive('lightChange',LIGHT_MODES.COMBAT)}} active={store.lightMode===LIGHT_MODES.COMBAT} color="#cc2200"/>
    <B label="Emergency" onClick={()=>{store.setLightMode(LIGHT_MODES.EMERGENCY);speakReactive('lightChange',LIGHT_MODES.EMERGENCY)}} active={store.lightMode===LIGHT_MODES.EMERGENCY} color="#ff1744"/>
    <B label="Normal" onClick={()=>{store.setLightMode(LIGHT_MODES.NORMAL);speakReactive('lightChange',LIGHT_MODES.NORMAL)}} active={store.lightMode===LIGHT_MODES.NORMAL}/>
    <B label={'Spotlight '+(store.spotlightOn?'ON':'OFF')} onClick={()=>{store.toggleSpotlight();speakReactive(useGameStore.getState().spotlightOn?'spotlightOn':'spotlightOff')}} active={store.spotlightOn} color="#ffffff"/>
    <B label="Thermal" onClick={()=>{store.toggleThermal();speakReactive(useGameStore.getState().thermalEnabled?'thermalEnabled':'thermalDisabled')}} active={store.thermalEnabled} color="#ff6d00"/>
    <B label="Sonar Ping" onClick={()=>{store.triggerActiveSonar();speakReactive('sonarPing')}}/>
    <B label={'View: '+(store.viewMode==='interior'?'INT':'EXT')} onClick={()=>{const nv=store.viewMode==='interior'?'exterior':'interior';store.setViewMode(nv);speakReactive(nv==='exterior'?'exteriorView':'interiorView')}} color="#64ffda"/>
    {isInterior&&<B label={'🔭 Periscope '+(periscopeMode?'ON':'OFF')} onClick={()=>{store.togglePeriscope?.();speakReactive?.('periscopeUp')}} active={periscopeMode} color="#88ffaa"/>}
    <B label="▶ Next Scene" onClick={()=>{store.advanceScene();setTimeout(()=>runSceneDialogue(useGameStore.getState().currentScene),900)}} color="#ffd600"/>
  </div>
}

function CommandInput(){
  const[text,setText]=useState('');const[va,setVa]=useState(false);const[tr,setTr]=useState('')
  const periscopeMode=useGameStore(s=>s.periscopeMode)
  useEffect(()=>{voiceInput.onStateChange=a=>setVa(a);voiceInput.onTranscript=(t,f)=>{setTr(t);if(f)setTimeout(()=>setTr(''),2000)}},[])
  const submit=useCallback(e=>{e?.preventDefault();if(text.trim()){handleCommand(text.trim());setText('')}},[text])
  // Hide on Quest (QuestHUD INDRA tab handles this) and periscope mode
  if(periscopeMode||IS_TOUCH) return null
  return<div style={{position:'absolute',bottom:16,left:'50%',transform:'translateX(-50%)',display:'flex',gap:6,alignItems:'center',zIndex:100}}>
    <button onClick={()=>{voiceInput.toggle();submarineAudio.playClick()}} style={{width:36,height:36,borderRadius:'50%',border:'2px solid '+(va?'#00e676':'rgba(0,229,255,0.25)'),background:va?'rgba(0,230,118,0.12)':'rgba(0,4,16,0.8)',color:va?'#00e676':'#00e5ff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,transition:'all 0.3s',boxShadow:va?'0 0 10px rgba(0,230,118,0.25)':'none'}}>🎙</button>
    <form onSubmit={submit} style={{display:'flex',gap:5}}>
      <input type="text" value={text} onChange={e=>setText(e.target.value)} placeholder={va?(tr||'Listening...'):'Enter command...'} style={{width:260,padding:'7px 12px',background:'rgba(0,4,16,0.88)',border:'1px solid rgba(0,229,255,0.15)',borderRadius:4,color:'#eceff1',fontFamily:'var(--font-mono)',fontSize:11,outline:'none'}}/>
      <button type="submit" style={{padding:'7px 14px',background:'rgba(0,229,255,0.08)',border:'1px solid rgba(0,229,255,0.25)',borderRadius:4,color:'#00e5ff',fontFamily:'var(--font-display)',fontSize:9,letterSpacing:1,cursor:'pointer'}}>EXECUTE</button>
    </form>
  </div>
}

function SceneTitle(){
  const scene=useGameStore(s=>s.currentScene);const[vis,setVis]=useState(false);const[title,setTitle]=useState('')
  const titles={[SCENES.BOOT]:'SYSTEM BOOT',[SCENES.AUTH]:'AUTHENTICATION',[SCENES.SYSTEMS_CHECK]:'SYSTEMS CHECK',[SCENES.DEPARTURE]:'DEPARTURE — VISAKHAPATNAM',[SCENES.SILENT_RUN]:'SILENT RUNNING',[SCENES.FIRST_CONTACT]:'FIRST CONTACT',[SCENES.THREAT_ASSESSMENT]:'THREAT ASSESSMENT',[SCENES.COMBAT_STATIONS]:'COMBAT STATIONS',[SCENES.TORPEDO_ENGAGEMENT]:'TORPEDO ENGAGEMENT',[SCENES.BRAHMOS_STRIKE]:'BRAHMOS STRIKE',[SCENES.DAMAGE_CONTROL]:'DAMAGE CONTROL',[SCENES.DEEP_DIVE]:'DEEP DIVE',[SCENES.RECOVERY]:'RECOVERY MISSION',[SCENES.FINAL_STAND]:'FINAL STAND',[SCENES.VICTORY]:'VICTORY — JAI HIND'}
  useEffect(()=>{setTitle(titles[scene]||'');setVis(true);const t=setTimeout(()=>setVis(false),4500);return()=>clearTimeout(t)},[scene])
  if(!vis||!title)return null
  return<div style={{position:'absolute',top:'14%',left:'50%',transform:'translateX(-50%)',textAlign:'center',animation:'slideUp 0.8s forwards',zIndex:160,pointerEvents:'none'}}>
    <div style={{fontSize:26,fontFamily:'var(--font-display)',color:'#00e5ff',letterSpacing:8,textShadow:'0 0 30px rgba(0,229,255,0.4)',fontWeight:700}}>{title}</div>
    <div style={{marginTop:6,height:2,background:'linear-gradient(90deg,transparent,#FF9933,#FFF,#138808,transparent)',margin:'6px auto',width:160}}/>
    <div style={{fontSize:9,fontFamily:'var(--font-mono)',color:'rgba(176,190,197,0.4)',letterSpacing:2,marginTop:4}}>INS ARIHANT • S73 • INDIAN NAVY</div>
  </div>
}

function TransitionOverlay(){
  const t=useGameStore(s=>s.sceneTransition);if(!t)return null
  return<div style={{position:'fixed',inset:0,zIndex:300,pointerEvents:'none',background:t==='flash'?'rgba(255,255,255,0.8)':'rgba(0,0,0,0.9)',animation:'sceneFlash 0.8s forwards'}}/>
}

function KeyHints(){
  const periscopeMode=useGameStore(s=>s.periscopeMode)
  // Only show key hints on desktop
  if(periscopeMode||IS_TOUCH) return null
  return<div style={{position:'absolute',bottom:56,left:'50%',transform:'translateX(-50%)',display:'flex',gap:5,zIndex:100}}>
    {[{k:'1-5',l:'Lights'},{k:'T',l:'Thermal'},{k:'P',l:'Periscope'},{k:'V',l:'Int/Ext'},{k:'F',l:'Torpedo'},{k:'B',l:'BrahMos'},{k:'R',l:'Track'},{k:'N',l:'Next'}].map(({k,l})=>
      <div key={k} style={{padding:'2px 7px',background:'rgba(0,4,16,0.7)',border:'1px solid rgba(0,229,255,0.08)',borderRadius:3,fontSize:7,fontFamily:'var(--font-mono)',color:'rgba(0,229,255,0.3)',whiteSpace:'nowrap'}}>
        <span style={{color:'rgba(0,229,255,0.5)'}}>[{k}]</span> {l}
      </div>)}
  </div>
}

export default function HUDOverlay(){
  const viewMode=useGameStore(s=>s.viewMode)
  const periscopeMode=useGameStore(s=>s.periscopeMode)
  const isInterior = viewMode === VIEW_MODES.INTERIOR || viewMode === 'interior'

  return<div style={{position:'fixed',inset:0,zIndex:100,pointerEvents:'none'}}>
    <div style={{pointerEvents:'auto'}}>
      {/* Desktop panels — hidden on Quest */}
      {!IS_TOUCH && <>
        <AIDialogue/>
        <StatusBar/>
        <WeaponsPanel/>
        <QuickActions/>
        <CommandInput/>
        <KeyHints/>
      </>}
      {/* Always shown */}
      <SceneTitle/>
      <TransitionOverlay/>
      {isInterior && <PeriscopeOverlay/>}
      {/* Quest / mobile full HUD — always rendered, self-hides on desktop */}
      <QuestHUD/>
    </div>
  </div>
}