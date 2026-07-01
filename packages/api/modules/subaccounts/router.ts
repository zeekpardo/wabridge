import { createSubaccount } from "./procedures/create-subaccount";
import { deleteSubaccount } from "./procedures/delete-subaccount";
import { getSubaccountProcedure } from "./procedures/get-subaccount";
import { listSubaccounts } from "./procedures/list-subaccounts";
import { updateSubaccount } from "./procedures/update-subaccount";

export const subaccountsRouter = {
	list: listSubaccounts,
	get: getSubaccountProcedure,
	create: createSubaccount,
	update: updateSubaccount,
	delete: deleteSubaccount,
};
