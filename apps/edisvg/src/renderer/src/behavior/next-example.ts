/** Included in each exported archive. It is a client boundary, not an async
 * component, browser-only render or hydration suppression. */
export const nextExample = `"use client";
import {useRef,useState} from "react";
import EdiAnimation,{type EdiSvgHandle} from "./EdiAnimation.jsx";
export default function NextExample(){
  const player=useRef<EdiSvgHandle>(null);
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  function run(action:(value:EdiSvgHandle)=>void){try{const current=player.current;if(!current)throw new Error("Player ainda não está pronto.");action(current);setError("");}catch(error){setError(error instanceof Error?error.message:"Operação recusada.");}}
  return <section aria-label="Animação interativa">
    <EdiAnimation ref={player} title="Animação interativa" autoplay={false} style={{width:"100%",height:240}} onReady={()=>setReady(true)} onError={error=>setError(error.message)}/>
    <fieldset disabled={!ready}><legend>Controles da animação</legend>
      <button type="button" onClick={()=>run(player=>player.play())}>Reproduzir</button>
      <button type="button" onClick={()=>run(player=>player.pause())}>Pausar</button>
      <button type="button" onClick={()=>run(player=>player.advance(.1))}>Avançar 0,1s</button>
      <button type="button" onClick={()=>run(player=>player.reset())}>Resetar</button>
    </fieldset>
    <p role="status">{error || (ready?"Player pronto":"Preparando player")}</p>
  </section>;
}
`;
