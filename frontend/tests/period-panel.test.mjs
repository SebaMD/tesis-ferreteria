import assert from 'node:assert/strict';
import test from 'node:test';
import {statisticsPeriodIndicator} from '../src/helpers/periodPresentation.js';

test('period indicator describes the applied preset, not edited form state',()=>{
 const today='2026-11-09';
 assert.equal(statisticsPeriodIndicator(null,today),'Todavía no hay estadísticas consultadas.');
 for(const [period,from,label] of [['today',today,'de hoy'],['last7','2026-11-03','de los últimos 7 días'],['last30','2026-10-11','de los últimos 30 días'],['currentMonth','2026-11-01','del mes actual']]){
  assert.equal(statisticsPeriodIndicator({period,from,to:today},today),`Mostrando estadísticas ${label}`);
 }
});

test('single-day/custom labels use calendar text without UTC/local conversion',()=>{
 assert.equal(statisticsPeriodIndicator({period:'day',from:'2026-11-09',to:'2026-11-09'},'2026-11-09'),'Mostrando estadísticas del 09-11-2026');
 assert.equal(statisticsPeriodIndicator({period:'custom',from:'2026-11-08',to:'2026-11-09'},'2026-11-09'),'Mostrando estadísticas del 08-11-2026 al 09-11-2026');
 assert.equal(statisticsPeriodIndicator({period:'today',from:'2026-11-08',to:'2026-11-08'},'2026-11-09'),'Mostrando estadísticas del 08-11-2026');
});
