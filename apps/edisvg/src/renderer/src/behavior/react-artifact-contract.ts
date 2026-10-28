/** Portable public facade: no workspace/Zod/Yoga types leak into consumers.
 * The artifact test checks this declaration against the source adapter. */
export const reactArtifactDeclaration = `import type {CSSProperties, Ref} from "react";
export type InputValue = string | number | boolean;
export type DataValue = InputValue | DataRecord | DataList;
export interface DataRecord {[id:string]:DataValue;}
export type DataList = {id:string;value:DataRecord}[];
export type DataChange = {instanceId:string;path:string[]} & ({operation:"set";value:unknown} | {operation:"insert";id:string;index:number;value?:unknown} | {operation:"remove";id:string} | {operation:"move";id:string;index:number});
export interface BehaviorDebug {machineId:string|null;time:number;layers:{id:string;stateId:string;time:number;transitionId:string|null}[];}
export interface RigDiagnostic {instancePath:string[];id:string;residual:number;solvedResidual:number|null;strength:number;converged:boolean;iterations:number;}
export interface BehaviorEmission {instancePath?:string[];layerId:string|null;stateId:string|null;animationId:string;eventId:string;name:string;data:Record<string,InputValue|null>;direction:"forward"|"reverse";time:number;}
export interface AudioStatus {enabled:boolean;activeVoices:number;buffers:number;envelopeSegments:number;stolenVoices:number;skippedLate:number;masterVolume:number;contextState:string;destroyed:boolean;}
export interface AudioCueEmission {bindingId:string;eventId:string;assetId:string;caption:string;instancePath:string[];}
export interface EdiSvgComponentHandle {readonly playing:boolean;play():void;pause():void;reset():void;setMachine(id:string):void;trigger(id:string):void;setInput(id:string,value:unknown):void;setInputs(values:Readonly<Record<string,unknown>>):void;getInput(id:string):InputValue|undefined;inspect():BehaviorDebug;inspectRig():RigDiagnostic[];advance(seconds:number):void;getData(instanceId?:string|null,path?:readonly string[]):DataValue;getDataInstance():string|null;bindDataInstance(instanceId:string):void;editData(changes:readonly DataChange[]):void;}
export interface EdiSvgHandle extends EdiSvgComponentHandle {getComponent(instancePath:readonly string[]):EdiSvgComponentHandle;enableAudio():Promise<void>;disableAudio():void;setAudioVolume(value:number):void;inspectAudio():AudioStatus;onAudioCue(callback:(cue:AudioCueEmission)=>void):()=>void;onAudioStateChange(callback:(status:AudioStatus)=>void):()=>void;}
export interface EdiAnimationProps {title?:string;fit?:"contain"|"cover"|"stretch";machineId?:string;inputValues?:Readonly<Record<string,InputValue>>;autoplay?:boolean;respectReducedMotion?:boolean;pauseOffscreen?:boolean;className?:string;style?:CSSProperties;ref?:Ref<EdiSvgHandle>;onEvent?:(event:BehaviorEmission)=>void;onAudioCue?:(cue:AudioCueEmission)=>void;onInputChange?:(id:string,value:InputValue)=>void;onStateChange?:(state:BehaviorDebug)=>void;onReady?:()=>void;onError?:(error:Error)=>void;}
export declare function EdiAnimation(props:EdiAnimationProps):import("react").ReactElement;
export default EdiAnimation;
`;
