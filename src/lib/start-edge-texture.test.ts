import {describe,expect,it} from 'vitest';
import {buildFragments,edgeFade,edgeFactor,edgeGeometry,fragmentY,selectionCandidate,selectionState,type EdgeRect} from './start-edge-texture';
const rect=(left:number,width=340,top=500):EdgeRect=>({left,right:left+width,width,top,bottom:780});
const geometry=()=>edgeGeometry(1440,900,rect(160),rect(940),76)!;
describe('edge texture bounds and timeline',()=>{
 it('follows real card widths and rejects insufficient gutters on either side',()=>{
  expect(geometry()).toMatchObject({leftEnd:228,rightStart:1212});
  expect(edgeGeometry(1280,800,rect(80),rect(860),76)).toBeNull();
  expect(edgeGeometry(1440,900,rect(160),rect(990),76)).toBeNull();
  expect(edgeGeometry(1440,900,rect(120),rect(980),76)).not.toBeNull();
 });
 it('fades inward and below the header and avoids all protected content',()=>{
  const g=geometry();expect(edgeFactor(0,g)).toBe(1);expect(edgeFactor(228,g)).toBe(0);expect(edgeFactor(1212,g)).toBe(0);expect(edgeFactor(1440,g)).toBe(1);
  expect(edgeFade(5,76,g)).toBe(0);expect(edgeFade(5,900,g)).toBe(0);expect(edgeFade(5,190,g)).toBeGreaterThan(edgeFade(5,100,g));
  g.excluded=[rect(0,100,200)];expect(edgeFade(20,300,g)).toBe(0);expect(edgeFade(110,300,g)).toBeGreaterThan(0);
 });
 it('sweeps for .6s, holds 2s and fades .9s with explicit end',()=>{
  expect(selectionState(-1,10)).toBeNull();expect(selectionState(0,10)?.upto).toBe(0);expect(selectionState(.3,10)).toEqual({upto:5,opacity:1});expect(selectionState(2.5,10)).toEqual({upto:10,opacity:1});expect(selectionState(3.05,10)?.opacity).toBeCloseTo(.5);expect(selectionState(3.5,10)).toBeNull();
 });
 it('keeps seeded layout stable and limits picks to visible outside fragments',()=>{
  const g=geometry(),a=buildFragments(g,()=>5),b=buildFragments(g,()=>5);expect(a).toEqual(b);expect(a.length).toBeGreaterThan(100);
  const candidate=a.find(f=>selectionCandidate(f,fragmentY(f,0,g.height),g))!;expect(candidate).toBeDefined();expect(selectionCandidate(candidate,100,g)).toBe(false);expect(selectionCandidate({...candidate,chars:candidate.chars.slice(0,2)},300,g)).toBe(false);
  expect(fragmentY(candidate,5,900)).toBe(candidate.y-20);
 });
});
