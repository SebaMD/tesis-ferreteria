import {test} from "node:test";
import assert from "node:assert/strict";
import {validateFamilyBrand} from "../dist/modules/productFamilies/familyBrand.service.js";
const body={brand:" Toro   Negro ",reason:"Corrección de una errata descriptiva",expectedRevision:"a".repeat(64),operationKey:"12345678-1234-1234-1234-123456789012",confirmed:true};
test("brand correction normalizes the same command and permits no unrelated commercial fields",()=>{
 assert.equal(validateFamilyBrand(body).brand,"Toro Negro");
 for(const change of [{brand:""},{brand:" "},{brand:"x".repeat(101)},{brand:"A\nB"},{brand:null},{reason:"corto"},{confirmed:false},{expectedRevision:"vieja"},{operationKey:"x"},{price:1},{name:"otro"},{unitMeasure:"caja"}])assert.throws(()=>validateFamilyBrand({...body,...change}));
});
