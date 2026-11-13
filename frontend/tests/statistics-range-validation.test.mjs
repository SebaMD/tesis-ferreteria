import test from 'node:test';
import assert from 'node:assert/strict';
import {statisticsRangeError} from '../src/helpers/managerStatistics.js';
import {getStatisticsPeriodRange,STATISTICS_PERIOD_OPTIONS,dateInputValue} from '../src/helpers/managerStatistics.js';
import {customPeriodError, reportDateError} from '../src/helpers/dateFilters.js';
const now=new Date(2026,10,9,12);
test('underlying statistics date contract accepts one day and rejects invalid dates; custom UX is checked separately',()=>{
 assert.equal(statisticsRangeError({from:'2026-11-09',to:'2026-11-09'},now),'');
 assert.equal(statisticsRangeError({from:'2026-10-31',to:'2026-11-09'},now),'');
 for(const range of [{from:'',to:'2026-11-09'},{from:'2026-02-30',to:'2026-11-09'},{from:'2026-11-09',to:'2026-11-08'},{from:'2026-11-09',to:'2026-11-10'},{from:'2024-01-01',to:'2026-11-09'}])assert.notEqual(statisticsRangeError(range,now),'');
 assert.equal(statisticsRangeError({from:'2026-11-08',to:'2026-11-09'},now),'');
});
test('custom range UX rejects equality without restricting the single-day API modes',()=>{
 const same={from:'2026-11-08',to:'2026-11-08'};
 assert.equal(customPeriodError(same,'custom'),'Desde debe ser anterior a Hasta.');
 for(const period of ['day','today','last7','last30','currentMonth'])assert.equal(customPeriodError(same,period),'');
 assert.equal(statisticsRangeError(same,now),'');
 assert.equal(reportDateError(same,'single',now),'');
 assert.equal(customPeriodError({from:'2026-11-07',to:'2026-11-08'},'custom'),'');
 assert.equal(customPeriodError({from:'',to:''},'custom'),'');
 assert.deepEqual(same,{from:'2026-11-08',to:'2026-11-08'});
});
test('six periods preserve local labels and Chile report labels across midnight and DST',()=>{
 assert.deepEqual(STATISTICS_PERIOD_OPTIONS.map(option=>option.value),['today','last7','last30','currentMonth','day','custom']);
 for(const instant of ['2026-11-06T01:30:00Z','2026-09-06T04:30:00Z','2027-01-01T01:00:00Z']){
  const date=new Date(instant),label=dateInputValue(date);
  assert.deepEqual(getStatisticsPeriodRange('today',date),{from:label,to:label});
  assert.deepEqual(getStatisticsPeriodRange('day',date),{from:label,to:label});
 }
 const instant=new Date('2027-01-01T01:00:00Z');
 assert.deepEqual(getStatisticsPeriodRange('today',instant,'America/Santiago'),{from:'2026-12-31',to:'2026-12-31'});
 assert.deepEqual(getStatisticsPeriodRange('last7',instant,'America/Santiago'),{from:'2026-12-25',to:'2026-12-31'});
 assert.deepEqual(getStatisticsPeriodRange('currentMonth',instant,'America/Santiago'),{from:'2026-12-01',to:'2026-12-31'});
 assert.equal(statisticsRangeError({from:'2024-01-01',to:'2024-12-31'},new Date(2025,0,1)), '');
 assert.notEqual(statisticsRangeError({from:'2023-12-31',to:'2024-12-31'},new Date(2025,0,1)), '');
});
