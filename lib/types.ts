export type Product={row:number;code:string;ucsCode:string;description:string;unit:string;ucsPrice:number|null;issue?:string};
export type Customer={code:string;name:string};
export type Purchase={customerCode:string;itemCode:string;date:string;invoice:string;line:number;qty:number;net:number;price:number};
export type Exception={scope:string;reference:string;message:string};
export type Discount={value:number|null;locked:boolean;updatedAt:string};
export type Snapshot={products:Product[];customers:Customer[];purchases:Purchase[];exceptions:Exception[];start:string;end:string;extractedAt:string;processedLines:number;complete:boolean};
export type State={revision?:number;snapshot:Snapshot|null;stagedProducts:Product[];stagedExceptions:Exception[];discounts:Record<string,Discount>;draft:Snapshot|null;nextDay:string|null;pendingHeaders:Record<string,unknown>[];runError:string|null};
export const key=(customer:string,item:string)=>JSON.stringify([customer,item]);


