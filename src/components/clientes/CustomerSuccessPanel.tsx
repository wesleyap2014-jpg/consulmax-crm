import React from"react";import{useCustomerSuccess}from"./useCustomerSuccess";import CustomerSuccessView from"./CustomerSuccessView";
export default function CustomerSuccessPanel(){const cs=useCustomerSuccess();return <CustomerSuccessView cs={cs}/>}
