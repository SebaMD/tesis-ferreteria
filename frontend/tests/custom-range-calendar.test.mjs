import assert from 'node:assert/strict';
import test from 'node:test';
import {calendarDay,customRangeBounds,customPeriodError,initializeCustomRange,validCustomRange} from '../src/helpers/dateFilters.js';
import {auditEmptyFilters,auditFilterValidationMessage} from '../src/helpers/auditNavigation.js';

test('custom calendar bounds are strictly ordered with either endpoint entered first',()=>{
 const today='2026-11-09';
 assert.equal(customRangeBounds({from:'',to:today},today).fromMax,'2026-11-08');
 assert.equal(customRangeBounds({from:'2026-11-06',to:''},today).toMin,'2026-11-07');
 assert.equal(customRangeBounds({from:'',to:''},today).fromMax,'2026-11-08');
 assert.equal(customRangeBounds({from:'',to:''},today).toMax,today);
 const same={from:'2026-11-06',to:'2026-11-06'},bounds=customRangeBounds(same,today);
 assert.equal(bounds.fromMax,'2026-11-05');assert.equal(bounds.toMin,'2026-11-07');
 assert.equal(customPeriodError(same,'custom'),'Desde debe ser anterior a Hasta.');
 assert.deepEqual(same,{from:'2026-11-06',to:'2026-11-06'});
 assert.equal(customPeriodError(same,'day'),'');
});

test('calendar shifts handle months, leap days and years without timestamp offsets',()=>{
 for(const [a,b] of [['2026-11-08','2026-11-09'],['2026-12-31','2027-01-01'],['2024-02-29','2024-03-01'],['2026-09-05','2026-09-06']]){
  const limits=customRangeBounds({from:a,to:b},'2027-01-02');
  assert.equal(limits.fromMax,a);assert.equal(limits.toMin,b);
 }
});

test('only statistics constrains both endpoints to its inclusive 366-day window',()=>{
 const filters={from:'2024-01-01',to:'2024-12-31'};
 const statistics=customRangeBounds(filters,'2026-11-09',366);
 assert.equal(statistics.fromMin,'2024-01-01');assert.equal(statistics.toMax,'2024-12-31');
 const reports=customRangeBounds(filters,'2026-11-09');
 assert.ok(reports.fromMin<'2023-01-01');assert.equal(reports.toMax,'2026-11-09');
 assert.equal(customRangeBounds({from:'2026-11-01',to:''},'2026-11-09',366).toMax,'2026-11-09');
});

test('invalid/incomplete endpoints leave recoverable calendar bounds without mutating data',()=>{
 for(const filters of [{from:'',to:''},{from:'bad',to:'2026-02-30'},{from:'2026-11-09',to:''},{from:'2027-01-01',to:'2027-01-02'},{from:'0100-01-01',to:'0100-01-01'}]){
  const original={...filters},bounds=customRangeBounds(filters,'2026-11-09',366);
  assert.ok(bounds.fromMin<=bounds.fromMax);assert.ok(bounds.toMin<=bounds.toMax);
  assert.ok(bounds.fromMax<'2026-11-09');assert.ok(bounds.toMax<='2026-11-09');assert.deepEqual(filters,original);
 }
 assert.ok(customPeriodError({from:'0099-12-31',to:'0100-01-02'},'custom'));
});

test('administrative history explicitly retains its same-day and current-UTC-day behavior',()=>{
 const now=new Date('2026-11-09T01:00:00Z');
 for(const day of ['2026-11-08','2026-11-09'])assert.equal(auditFilterValidationMessage({...auditEmptyFilters,from:day,to:day},{},now),'');
});

test('first custom entry initializes yesterday/today using calendar labels across boundaries',()=>{
 for(const [today,yesterday] of [['2026-11-09','2026-11-08'],['2026-03-01','2026-02-28'],['2024-03-01','2024-02-29'],['2027-01-01','2026-12-31'],['2026-09-06','2026-09-05']]){
  for(const limit of [undefined,366]){
   const range=initializeCustomRange(null,today,limit);
   assert.deepEqual(range,{from:yesterday,to:today});assert.equal(validCustomRange(range,today,limit),true);
  }
 }
 const chileToday=calendarDay(new Date('2026-11-09T01:00:00Z'),'America/Santiago');
 assert.deepEqual(initializeCustomRange(null,chileToday),{from:'2026-11-07',to:'2026-11-08'});
});

test('initialization preserves saved valid custom ranges and repairs only invalid saved ranges',()=>{
 const today='2026-11-09',valid={from:'2026-10-01',to:'2026-10-10'};
 assert.deepEqual(initializeCustomRange(valid,today,366),valid);assert.notEqual(initializeCustomRange(valid,today,366),valid);
 for(const previous of [{from:'',to:''},{from:today,to:today},{from:'2026-11-08',to:'2026-11-07'},{from:'2026-11-08',to:'2026-11-10'},{from:'bad',to:'2026-11-08'}]){
  const original={...previous};assert.deepEqual(initializeCustomRange(previous,today,366),{from:'2026-11-08',to:today});assert.deepEqual(previous,original);
 }
 const long={from:'2020-01-01',to:'2026-01-01'};
 assert.deepEqual(initializeCustomRange(long,today),long);
 assert.deepEqual(initializeCustomRange(long,today,366),{from:'2026-11-08',to:today});
});
