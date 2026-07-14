// Backend API functions for PURCHASE intake queue

function ensurePurchasesSheet(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheet=ss.getSheetByName('PURCHASES');
  if(!sheet){
    sheet=ss.insertSheet('PURCHASES',ss.getSheets().length);
    var headers=['purchase_id','date_received','timestamp','employee_name','item_type','item_category','brand','model','serial','part_name','condition','qty','purchase_price','seller_source','seller_phone','location','ready_now','notes','stage','status','promote_when_saved','target_inventory'];
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
  } else {
    var headerRow=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var requiredHeaders=['purchase_id','date_received','item_type','item_category','brand','seller_source','stage','status'];
    var missingHeaders=[];
    requiredHeaders.forEach(function(h){
      if(headerRow.indexOf(h)<0)missingHeaders.push(h);
    });
    if(missingHeaders.length>0){
      Logger.log('Warning: PURCHASES sheet missing headers: '+missingHeaders.join(', '));
    }
  }
  return sheet;
}

function api_addPurchase(payload){
  try{
    var itemType = String(payload.item_type || '').toUpperCase();
    var itemCategory=payload.item_category;
    var brand=payload.brand;
    var sellerSource=payload.seller_source;

    if(!itemType||!itemCategory||!brand||!sellerSource){
      return {ok:false,error:'Missing required fields: item_type, item_category, brand, seller_source'};
    }

    var qty = payload.qty;
    if (qty === undefined || qty === null || qty === '') {
      qty = (itemType === 'APPLIANCE') ? 1 : 0;
    }
    qty = parseInt(qty, 10);

    if (isNaN(qty) || qty < 1) {
      return {ok:false,error:'Quantity must be 1 or more'};
    }

    var price=payload.purchase_price||0;
    if(isNaN(price)||price<0){
      return {ok:false,error:'Purchase price cannot be negative'};
    }

    var purchaseId='PUR-'+new Date().getTime();
    var now=new Date();
    var dateStr=Utilities.formatDate(now,'America/Chicago','yyyy-MM-dd');
    var timeStr=Utilities.formatDate(now,'America/Chicago','HH:mm:ss');
    var employeeName=Session.getEffectiveUser()?Session.getEffectiveUser().getEmail():'Unknown';

    var targetInventory='';
    if(itemType==='APPLIANCE')targetInventory='APPLIANCES';
    else if(itemType==='PART')targetInventory='PARTS';
    else if(itemType==='ELECTRONICS')targetInventory='ELECTRONICS';

    var sheet=ensurePurchasesSheet();
    var row=[
      purchaseId,dateStr,timeStr,employeeName,itemType,itemCategory,brand,
      payload.model||'',payload.serial||'',payload.part_name||'',payload.condition||'',
      qty,price,sellerSource,payload.seller_phone||'',payload.location||'',
      payload.ready_now||'NO',payload.notes||'','RECEIVED','PENDING_VALIDATION','NO',targetInventory
    ];

    sheet.appendRow(row);
    Logger.log('Purchase added: '+purchaseId+' - '+brand+' ('+itemType+')');

    return {ok:true,purchase_id:purchaseId};

  } catch(e){
    Logger.log('Error in api_addPurchase: '+e.toString());
    return {ok:false,error:e.toString()};
  }
}
