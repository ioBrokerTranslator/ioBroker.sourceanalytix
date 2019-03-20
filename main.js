"use strict";

/*
 * Created with @iobroker/create-adapter v1.11.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");


// Load your modules here, e.g.:
// Lets make sure we know all days and months
const weekdays = JSON.parse('["07_Sunday","01_Monday","02_Tuesday","03_Wednesday","04_Thursday","05_Friday","06_Saturday"]');
const months = JSON.parse('["01_January","02_February","03_March","04_April","05_May","06_June","07_July","08_August","09_September","10_October","11_November","12_December"]');
// Create variables for object arrays
const history    = {};
const aliasMap   = {};
const wh_start_val = [];
let state_set = [], dev_log, mon_log;
// Time Modules
const cron = require("node-cron"); // Cron Scheduler
// const fs = require("fs");

class Sourceanalytix extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "sourceanalytix",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("objectChange", this.onObjectChange.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.update_states_all;
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info("Adapter SourceAnalytix stopped !");
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		let existing = false;
		let array_id;
		
		if (dev_log === true){this.log.info("Object array from trigger : " + JSON.stringify(state_set));}
		if (dev_log === true){this.log.info("Object array of trigger : " + JSON.stringify(obj));}
		// Check if change object is part of array
		for(const x in state_set) {

			if (state_set[x] === id){
				existing = true;
				array_id = x;
			}

		}


		// Check if object is activated for SourceAnalytix
		if (obj && obj.common &&
			(
				(obj.common.custom  && obj.common.custom[this.namespace]  && obj.common.custom[this.namespace].enabled)
			)
		) {			
			// Verify if the object was already activated, if no initialize and start cron else only initialize new settings
			if (existing === false){
				this.log.info("Enable SourceAnalytix for : " + id);
				// Add object to array
				state_set.push(id);
				this.initialize(obj);
				// Start cron to reset values at day, week etc start
				this.reset_shedules (obj);				
			} else { 
				this.log.info("Updated SourceAnalytix configuration for : " + id);
				this.initialize(obj);
			}

			if (dev_log === true){this.log.info("Complete object array : " + JSON.stringify(state_set));}
		
		} else {

			
			if ( existing === true) {
				this.log.info("Disable SourceAnalytix for : " + id);
				this.unsubscribeForeignStates(id);
				state_set.splice(array_id, 1); 
				
			}

		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			if (mon_log === true){this.log.info(`state ${id} changed : ${state.val} SourceAnalytix calculation executed`);}
			this.getForeignObject(id, function (err, obj){
				if (obj !== undefined && obj !== null){
					this.calculation_handler(obj);
				}
			});
		}
	}

	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.message" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

	update_states_all (){ 
		// clean variable
		state_set = [];
		// Adopt logging setting from configuration
		dev_log = this.config.developer_logging;
		mon_log = this.config.status_logging;		

		// // initialize all SourceAnalytix enabled states
		// this.log.info("Update state settings");

		this.objects.getObjectView("custom", "state", {}, (err, doc) => {

			let count = 0; 
			if (doc && doc.rows) {
				for (let i = 0, l = doc.rows.length; i < l; i++) {
					if (doc.rows[i].value) {
						let id = doc.rows[i].id;
	
						// temporary disable, should consider to have alias also in SourceAnalytix in case meters are changed
						// const realId = id;
						if (doc.rows[i].value[this.namespace] && doc.rows[i].value[this.namespace].aliasId) {
							aliasMap[id] = doc.rows[i].value[this.namespace].aliasId;
							this.log.debug("Found Alias: " + id + " --> " + aliasMap[id]);
							id = aliasMap[id];
						}
						history[id] = doc.rows[i].value;
	
						if (history[id].enabled !== undefined) {
							history[id] = history[id].enabled ? {"history.0": history[id]} : null;
							if (!history[id]) {
								this.log.info("undefined id");
								// delete history[id];
								continue;
							}
						}
						if (!history[id][this.namespace] || history[id][this.namespace].enabled === false) {
							// delete history[id];
						} else {
							count++;
							this.getForeignObject(id, function (err, obj){
								if (obj !== undefined && obj !== null){
									// Push object into variable array used for checks later
									state_set.push(id);
									// run initialisation for objects
									this.log.info("Activate SourceAnalytix for : " + obj._id);
									this.initialize(obj);
									if (dev_log === true){this.log.info("Object array : " + JSON.stringify(state_set));}
									
									// Start cron to reset values at day, week etc start
									this.reset_shedules (obj);
								}
							});
						}
					}
				}
			}

		});

	}
	// null values must be set 0 to avoid issue in later processing, def: 0 at object creation possible n js-controler 2.0
	async set_zero_val (id){

		const inst_name = this.namespace;
	
		const reading = await this.getForeignStateAsync(inst_name + "." + id);
		if(dev_log === true){this.log.info("Zero val at initalisation, value of state : " + JSON.stringify(reading));}
		if (reading === null) {
			
			if(dev_log === true){this.log.info("Zero val at initalisation, target state : " + inst_name + "." + id);}
	
			this.setState(inst_name + "." + id, { val: 0, ack: true });}
	}

	// Function to calculate current week number
	getWeekNumber(d) {
		// Copy date so don't modify original
		d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
		// Set to nearest Thursday: current date + 4 - current day number
		// Make Sunday's day number 7
		d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
		// Get first day of year
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
		// Calculate full weeks to nearest Thursday
		//@ts-ignoreTS-ignore
		let weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);

		if (weekNo < 10){
			//@ts-ignoreTS-ignore
			weekNo = "0" + weekNo;
		}
		// Return array of year and week number
		return [weekNo];
	}

	// Function to calculate current quarter
	// function quarter_of_the_year(){
	// 		const date = new Date();
	// 		const m = date.getMonth()+1;
	// 		return Math.ceil(m/3);
	// }

	// Function to reset start values for each day, week, month, quarter, year
	async reset_shedules (obj_array){
		const inst_name = this.namespace;

		// Prepare custom object
		const obj = {};
		obj.common = {};
		obj.common.custom = {};
		obj.common.custom[inst_name] = {};

		// Reset day counter
		cron.schedule("0 0 * * *", async function(){
			// get current meter value
			const reading = await this.getForeignStateAsync(obj_array._id);
			const calc_reading = this.unit_calc_fact(obj_array, reading.val);

			// Extend object with start value day
			obj.common.custom[this.namespace].start_day = calc_reading;
			if (dev_log === true){this.log.info("Object content custom current : " + JSON.stringify(obj));}

			//@ts-ignore Issue in recognized obj correctly, must be fixed in template
			this.extendForeignObject(obj_array._id, obj, function (err) {
				if (err) {
					this.log.error("Setting start value Day failed : " + err);
				} else {
					if (dev_log === true){this.log.info("Object content custom after start_day value reset : " + JSON.stringify(obj));}
					this.log.info("Setting start value Day for device : " + obj_array._id + " succeeded with value + " + calc_reading);
				}
			});
		});
		
		// Reset Week counter
		cron.schedule("0 0 * * 1", async function(){

			// get current meter value
			const reading = await this.getForeignStateAsync(obj_array._id);
			const calc_reading = this.unit_calc_fact(obj_array, reading.val);

			// Extend object with start value week
			obj.common.custom[this.namespace].start_week = calc_reading;
			if (dev_log === true){this.log.info("Object content custom current : " + JSON.stringify(obj));}

			//@ts-ignore Issue in recognized obj correctly, must be fixed in template
			this.extendForeignObject(obj_array._id, obj, function (err) {
				if (err) {
					this.log.error("Setting start value Week failed : " + err);
				} else {
					if (dev_log === true){this.log.info("Object content custom after start_day value reset : " + JSON.stringify(obj));}
					this.log.info("Setting start value Week for device : " + obj_array._id + " succeeded with value + " + calc_reading);
				}
			});
		});
		
		// Reset month counter
		cron.schedule("0 0 1 * *", async function(){

			// get current meter value
			const reading = await this.getForeignStateAsync(obj_array._id);
			const calc_reading = this.unit_calc_fact(obj_array, reading.val);

			// Extend object with start value month
			obj.common.custom[this.namespace].start_month = calc_reading;
			if (dev_log === true){this.log.info("Object content custom current : " + JSON.stringify(obj));}

			//@ts-ignore Issue in recognized obj correctly, must be fixed in template
			this.extendForeignObject(obj_array._id, obj, function (err) {
				if (err) {
					this.log.error("Setting start value month failed : " + err);
				} else {
					if (dev_log === true){this.log.info("Object content custom after start_day value reset : " + JSON.stringify(obj));}
					this.log.info("Setting start value month for device : " + obj_array._id + " succeeded with value + " + calc_reading);
				}
			});
		});
		
		// Reset quarter counter
		cron.schedule("0 0 1 1,4,7,10 *", async function(){

			// get current meter value
			const reading = await this.getForeignStateAsync(obj_array._id);
			const calc_reading = this.unit_calc_fact(obj_array, reading.val);

			// Extend object with start value quarter
			obj.common.custom[this.namespace].start_quarter = calc_reading;
			if (dev_log === true){this.log.info("Object content custom current : " + JSON.stringify(obj));}

			//@ts-ignore Issue in recognized obj correctly, must be fixed in template
			this.extendForeignObject(obj_array._id, obj, function (err) {
				if (err) {
					this.log.error("Setting start value quarter failed : " + err);
				} else {
					if (dev_log === true){this.log.info("Object content custom after start_day value reset : " + JSON.stringify(obj));}
					this.log.info("Setting start value quarter for device : " + obj_array._id + " succeeded with value + " + calc_reading);
				}
			});
		});
		
		// Reset year counter
		cron.schedule("0 0 1 1 *", async function(){

			// get current meter value
			const reading = await this.getForeignStateAsync(obj_array._id);
			const calc_reading = this.unit_calc_fact(obj_array, reading.val);

			// Extend object with start value year
			obj.common.custom[this.namespace].start_year = calc_reading;
			if (dev_log === true){this.log.info("Object content custom current : " + JSON.stringify(obj));}

			//@ts-ignore Issue in recognized obj correctly, must be fixed in template
			this.extendForeignObject(obj_array._id, obj, function (err) {
				if (err) {
					this.log.error("Setting start value year failed : " + err);
				} else {
					if (dev_log === true){this.log.info("Object content custom after start_day value reset : " + JSON.stringify(obj));}
					this.log.info("Setting start value year for device : " + obj_array._id + " succeeded with value + " + calc_reading);
				}
			});
		});
	}	

	// Ensure always the calculation factor is correctly applied (example Wh to kWh, we calculate always in kilo)
	unit_calc_fact (obj, value){
		if(dev_log === true){this.log.info("Object array input for unit factore calculation : " + JSON.stringify(obj));}
		if(dev_log === true){this.log.info("State value input for unit factore calculation : " + JSON.stringify(value));}
		if (value === null){
			if (dev_log === true){this.log.error("Data error ! NULL value received for current reading of device : " + obj._id);}
		}
		const inst_name = this.namespace;
		const obj_cust = obj.common.custom[inst_name];
		// this.log.info("Intervall : " + intervall);
		let unit = "";
		
		if(dev_log === true){this.log.info("Test unit from object : " + unit);}
		if(dev_log === true){this.log.info("Test unit from custom object : " + obj_cust.state_unit);}

		// Replace meassurement unit when selected in state setting
		if(obj_cust.state_unit !== undefined && obj_cust.state_unit !== "automatically") {
			unit = obj.common.unit.toLowerCase().replace(/\s|[0-9_]|\W|[#$%^&*()]/g, "");
			unit = obj_cust.state_unit.toLowerCase();
			if(dev_log === true){this.log.info("Unit of state origing change to : " + unit);}
		}
		
		let calc_value;

		switch (unit) {
			case "kwh":
				calc_value = value;
				break;
			case "wh":
				calc_value = value / 1000;
				break;
			case "m3":
				calc_value = value;
				break;
			case "l":
				calc_value = value / 1000;
				break;
			default:
				this.log.error("Case error : value received for calculation with unit : " + unit + " which is currenlty not (yet) supported");
		}

		if (calc_value === null){
			this.log.error("Data error ! NULL value received for current reading of device : " + obj._id);
		}

		if(dev_log === true){this.log.info("State value output of unit factore calculation : " + JSON.stringify(calc_value));}

		return calc_value;
	}

	// Function to handle channel creation
	ChannelCreate (id, channel, name){
		if(dev_log === true){this.log.info("Parent device : " + id);}
		if(dev_log === true){this.log.info("Create channel id : " + channel);}
		if(dev_log === true){this.log.info("Create channel name : " + name);}
		this.createChannel(id, channel,{
			"name": name
		});
	}
	
	// Function to handle state creation
	doStateCreate(delivery, device, id, name, type,role, unit, head, financial, reading){	
		let head_cathegorie;
		let financiel_cathegorie;

		// create seperate channels for amounts, costs and current value
		if(delivery){
			head_cathegorie = "delivery";
			financiel_cathegorie = "earnings";
		} else {
			head_cathegorie = "consumption";
			financiel_cathegorie = "cost";
		}

		let object = device + "." + head_cathegorie + id;			

		if (head){
			this.ChannelCreate(device, head_cathegorie, head_cathegorie);
			this.setObjectNotExists(object, {
				type: "state",
				common: {
					name: name,
					type: type,
					role: role,
					read: true,
					unit: unit,
					def: 0,
				},
				native: {},
			});
			this.set_zero_val(object);
		}

		if (financial){
			this.ChannelCreate(device, financiel_cathegorie, financiel_cathegorie);
			object = device + "." + financiel_cathegorie + id;			

			this.setObjectNotExists(object, {
				type: "state",
				common: {
					name: name,
					type: type,
					role: role,
					read: true,
					unit: "€",
					def: 0,
				},
				native: {},
			});
			this.set_zero_val(object);
		}

		if (reading){

			object = device + "." + "Meter_Readings" + id;			
			this.ChannelCreate(device, "Meter_Readings", "Meter_Readings");
			this.setObjectNotExists(object, {
				type: "state",
				common: {
					name: name,
					type: type,
					role: role,
					read: true,
					unit: unit,
					def: 0,
				},
				native: {},
			});
			this.set_zero_val(object);
		}
	}

	// Create object tree and states for all devices to be handled
	initialize(obj) {
		const inst_name = this.namespace;
		const id = obj._id;
		const obj_cust = obj.common.custom[inst_name];
		let skip_init = false;
		let w_calc = false;
		// this.log.info("Intervall : " + intervall);
		let unit = "";
		
		// Replace meassurement unit when selected in state setting
		if(obj_cust.state_unit === undefined) {
			
			if (obj_cust.state_unit != "automatically") {
				unit = obj.common.unit.toLowerCase().replace(/\s|[0-9_]|\W|[#$%^&*()]/g, "");
				unit = obj_cust.state_unit.toLowerCase();
				if(dev_log === true){this.log.info("Unit of state origing change to : " + unit);}

			} else {

				this.log.error(obj._id + " Does not have a unit defined, please selecte the propper unit at the state settings ");
				skip_init = true;

			}

		}

		// Check if initialization should be handled
		if (skip_init === false) {

			if(dev_log === true){this.log.info("instanze name : " + inst_name);}
			// const obj_cust = this.config.custom;
			if(dev_log === true){this.log.info("Content custom of object : " + JSON.stringify(obj_cust));}
			if(dev_log === true){this.log.info("Custom object tree : " + JSON.stringify(obj_cust));}

			// Currently only support kWh & m3)
			if((unit == "kwh") || (unit == "m3") || (unit == "wh") || (unit == "l") || (unit == "w")){

				if(unit === "wh"){unit = "kWh";}
				if(unit === "w"){unit = "kWh"; w_calc = true;}
				if(unit === "kwh"){unit = "kWh";}
				if(unit === "l"){unit = "m3";}

				// replace "." in datapoints to "_"
				const device = id.split(".").join("__");

				if(dev_log === true){this.log.info("Changed Device Name : " + device);}

				// 	// Set type to consume or deliver
				let delivery;
				if(dev_log === true){this.log.info("Delivery type : " + delivery);}

				if (obj_cust.state_type == "kWh_delivery") {
					delivery = true;
				} else {
					delivery = false;
				}
				
				// define device name, change with alias when required
				let alias = obj.common.name;
				if(dev_log === true){this.log.info("Name before alias renaming : " + alias);}
				if(dev_log === true){this.log.info("Device name : " + alias);}
				if(dev_log === true){this.log.info("State alias name : " + obj_cust.alias);}
				if(obj_cust.alias !== undefined && obj_cust.alias !== null && obj_cust.alias !== "") {alias = obj_cust.alias;}
				if(dev_log === true){this.log.info("Name after alias renaming" + alias);}
				
				// Create new device object for every state in powermonitor tree
				this.setObjectNotExists(device, {
					type: "device",
					common: {
						name: alias
					},
					native: {},
				});

				// change device name when alias is updated
				const objekt = {};
				objekt.common = {
					name: alias
				};
				this.extendObject(device, objekt, function (err) {
					if (err !== null){this.log.error("Changing alias name failed with : " + err);}
				});		

				if(dev_log === true){this.log.info("Customized Device name = : " + alias);}
				if(dev_log === true){this.log.info("Days ? : " + this.config.store_days);}
				if(dev_log === true){this.log.info("Consumption ?  : " + obj_cust.consumption);}
				if(dev_log === true){this.log.info("Costs : " + obj_cust.costs);}
				if(dev_log === true){this.log.info("Meter History ? : " + obj_cust.meter_values);}

				if (this.config.store_days === true) {
					if(dev_log === true){this.log.info("Creating weekdays");}
					// create states for weekdays
					for (const x in weekdays){
						const curent_day = ".current_year.this_week." + weekdays[x];
						// doStateCreate(delivery, device, curent_day , weekdays[x], "number","value.day", unit, obj_cust.consumption, obj_cust.CalcCost, obj_cust.meter_values);
						this.doStateCreate(delivery, device, curent_day , weekdays[x], "number","value.day", unit, obj_cust.consumption, obj_cust.costs, obj_cust.meter_values);
					}
				}

				if (this.config.store_weeks) {
					// create states for weeks
					let weeknr;
					for (let y = 1; y < 54; y++) {
						if ( y < 10 ) {
							weeknr = "0" + y;
						} else {
							weeknr = y;
						}
						const state_root = ".current_year.weeks." + weeknr;
						this.doStateCreate(delivery,device,state_root , "week " + weeknr, "number","value.day", unit, obj_cust.consumption, obj_cust.costs, obj_cust.meter_values);
					}
				}

				if (this.config.store_months) {
					// create states for months
					for (const x in months){
						const curent_day = ".current_year.months." + months[x];
						this.doStateCreate(delivery,device,curent_day , months[x], "number","value.month", unit, obj_cust.consumption, obj_cust.costs, obj_cust.meter_values);
					}
				}

				// create state for current day/week/quarters/month current value
				let state_root = ".01_current_day";
				this.doStateCreate(delivery,device,state_root , "current Day ", "number","value.week", unit, obj_cust.consumption, obj_cust.costs, false);
				state_root = ".02_current_week";
				this.doStateCreate(delivery,device,state_root , "current Week ", "number","value.week", unit, obj_cust.consumption, obj_cust.costs, false);
				state_root = ".03_current_month";
				this.doStateCreate(delivery,device,state_root , "current Month ", "number","value.month", unit, obj_cust.consumption, obj_cust.costs, false);
				state_root = ".04_current_quarter";
				this.doStateCreate(delivery,device,state_root , "current Quarter", "number","value.quarter", unit, obj_cust.consumption, obj_cust.costs, false);
				state_root = ".05_current_year";
				this.doStateCreate(delivery,device,state_root , "current Year", "number","value.year", unit, obj_cust.consumption, obj_cust.costs, false);

				state_root = ".Current_Reading";
				if(w_calc == false){this.doStateCreate(delivery,device,state_root , "Current Reading", "number","value.current", unit, false, false, obj_cust.meter_values);}

				// Create meassurement states for calculations related w to kWh 
				if(w_calc == true){
					state_root = ".Current_Reading";
					this.doStateCreate(delivery,device,state_root , "Current Reading", "number","value.current", "W", false, false, true);
					state_root = ".Current_Reading_kWh";
					this.doStateCreate(delivery,device,state_root , "Current Reading to kWh", "number","value.current", unit, false, false, true);
				}

				if(dev_log === true){this.log.info("Initialization finished for : " + device);}
				// Subscribe state, every state change will trigger calculation
				this.subscribeForeignStates(obj._id);

			} else {

				this.log.error("Sorry unite type " + unit + " not supported yet");

			}

			// Calculate all values for the first time
			this.calculation_handler(obj);

		}
	}
	// Calculation handler
	async calculation_handler(id){
		const inst_name = this.namespace;
		if(dev_log === true){this.log.info("Instance name : " + inst_name);}
		let cost_t, del_t,state_val;
		const date = new Date();
		let cost_basic, cost_unit, skip_calc = false;
		if(dev_log === true){this.log.info("Write calculations for : " + id._id);}

		// replace "." in datapoints to "_"
		const obj_id = id._id.split(".").join("__");
		const obj_root = this.namespace + "." + obj_id;

		if(dev_log === true){this.log.info("Calc obj root " + obj_root);}

		const obj_cont = await this.getForeignObjectAsync(id._id);
		if(dev_log === true){this.log.info("State object content: " + JSON.stringify(obj_cont));}
		//@ts-ignore custom does exist
		const obj_cust = obj_cont.common.custom[inst_name];
		if(dev_log === true){this.log.info("State object custom content: " + JSON.stringify(obj_cust));}
		// Define whih calculation factor must be used

		switch (obj_cust.state_type) {

			case "kWh_consumption":
				if(dev_log === true){this.log.info("Case result : Electricity consumption");}
				cost_unit = this.config.unit_price_power;
				cost_basic = this.config.basic_price_power;
				break;
			case "kWh_consumption_night":
				if(dev_log === true){this.log.info("Case result : Electricity consumption night");}
				cost_unit = this.config.unit_price_power_night;
				cost_basic = this.config.basic_price_power;
				break;

			case "kWh_delivery":
				if(dev_log === true){this.log.info("Case result : Electricity delivery");}
				cost_unit = this.config.unit_price_power_delivery;
				cost_basic = this.config.basic_price_power;
				break;

			case "kWh_heatpomp":
				if(dev_log === true){this.log.info("Case result : Heat Pump");}
				cost_unit = this.config.unit_price_heatpump;
				cost_basic = this.config.basic_price_heatpump;
				break;

			case "kWh_heatpomp_night":
				if(dev_log === true){this.log.info("Case result : Heat Pump night");}
				cost_unit = this.config.unit_price_heatpump_night;
				cost_basic = this.config.basic_price_heatpump;
				break;			

			case "gas":
				if(dev_log === true){this.log.info("Case result : Gas");}
				cost_unit = this.config.unit_price_gas;
				cost_basic = this.config.basic_price_gas;
				break;
			
			case "water_m3":
				if(dev_log === true){this.log.info("Case result : Water");}
				cost_unit = this.config.unit_price_water;
				cost_basic = this.config.basic_price_water;
				break;
			
			case "oil_m3":
				if(dev_log === true){this.log.info("Case result : Oil");}
				cost_unit = this.config.unit_price_oil;
				cost_basic = this.config.basic_price_oil;
				break;

			default:
				this.log.error("Error in case handling of cost type identificaton : " + obj_cust.state_type);
				skip_calc = true;
		}

		if (skip_calc === false){


			// Get current value from meter
			const reading = await this.getForeignStateAsync(id._id);

			if (id.common.unit == "W"){

				// Write current received W value to state
				this.setState(obj_root + ".Meter_Readings.Current_Reading", { val: reading.val.toFixed(3) ,ack: true });

				// verify if startvalue ist set for calculation, if not store start value.
				const kWh_start_val = obj_root + ".Meter_Readings.Current_Reading_kWh";
				const W_start_val = obj_root + ".Meter_Readings.Current_Reading";
				this.log.info("Before logic of watt : " + JSON.stringify(wh_start_val));
				this.log.warn("array content for start val : " + wh_start_val["sourceanalytix.0.discovergy__0__1024000034__Power_1.Meter_Readings.Current_Reading_kWh"]);
				if (wh_start_val[kWh_start_val]  === undefined) {

					this.log.error("Current wh start value = undefined");

					// Get current stored kWh value and calculate new kWh based on timing of meassurement
					const kWh_stored  = await this.getStateAsync(kWh_start_val);
					this.log.warn("after kWh_stored");
					const kWh_calc = 1000 * kWh_stored.val;
					this.log.warn("after kWh_cal");
					this.log.warn('"' + obj_root + '.Meter_Readings.Current_Reading_kWh"' + ":" + kWh_calc);
					// const array_obj = JSON.parse('{"' + obj_root + '.Meter_Readings.Current_Reading_kWh"' + ":" + kWh_calc + "}");
					// const array_obj = JSON.parse('{"' + obj_id + '.Meter_Readings.Current_Reading_kWh" : {value":"' + kWh_calc + "}}");

					// wh_start_val.push("{" + obj_id + ".Meter_Readings.Current_Reading_kWh" + "}");
					const test_start = obj_id + ".Meter_Readings.Current_Reading_kWh";
					const wh_start_val_temp = {};
					wh_start_val_temp.push('"' + test_start + '" : "' + kWh_calc + '"');
					this.log.info("push try : " + JSON.stringify(wh_start_val_temp));

					const arrayForObject = JSON.parse("{" + wh_start_val_temp + "}");
					this.log.info("Array read : " + JSON.stringify(arrayForObject));
					wh_start_val.push(wh_start_val_temp);
					this.log.info("Array read start val : " + JSON.stringify(wh_start_val));

					// wh_start_val.push(JSON.parse(wh_start_val_temp));
					// test_1.push(obj_id + ".Meter_Readings.Previous_Reading_kWh");
					// this.log.info("push try : " + JSON.stringify(wh_start_val));
					// const wh_test_bla = JSON.parse("{" + wh_start_val + "}");
					// this.log.info("push try after value push : " + JSON.stringify(wh_test_bla));

					// this.log.warn("after array buid");
					// wh_start_val.push(array_obj);
					// this.log.info(JSON.stringify(wh_start_val));
					// const bla = obj_id + ".Meter_Readings.Current_Reading_kWh";
					// this.log.error("Obj_root_build : " + bla);
					// this.log.info(JSON.stringify(wh_start_val[bla]));
					// this.log.warn("test_issue");
					
				} else {
					const w_stored  = await this.getStateAsync(W_start_val);
					const w_obj  = await this.getObjectAsync(W_start_val);
					const kWh_stored  = await this.getStateAsync(kWh_start_val);
					const kWh_obj  = await this.getObjectAsync(kWh_start_val);

					this.log.error(JSON.stringify(w_stored));
					this.log.error(JSON.stringify(w_obj));
					this.log.error(JSON.stringify(kWh_stored));
					this.log.error(JSON.stringify(kWh_obj));
					// const calculated = kWh_stored * w_stored.val * (w_obj.ts);

				}
				this.log.info("After logic of watt : " + JSON.stringify(wh_start_val));
			}

			const calc_reading = this.unit_calc_fact(id, reading.val);
			
			if(dev_log === true){this.log.info("Meter current reading : " + reading.val);}
			if(dev_log === true){this.log.info("Meter calculated reading : " + calc_reading);}



			if(dev_log === true){this.log.info("Handle cost calculations : " + obj_cust.costs);}
			if(dev_log === true){this.log.info("Calculation Factor : " + cost_unit);}
			if(dev_log === true){this.log.info("Cost basic : " + cost_basic);}
			if(dev_log === true){this.log.info("Cost unit : " + cost_unit);}
			if(dev_log === true){this.log.info("Handle consumption calculations : " + obj_cust.consumption);}
			if(dev_log === true){this.log.info("Handle meter history : " + obj_cust.meter_values);}

			// temporary set to sero, this calue will be used later to handle period calculations
			const reading_start = 0; 	//obj_cust.start_meassure; 
			const day_bval = obj_cust.start_day;
			const week_bval = obj_cust.start_week;
			const month_bval = obj_cust.start_month;
			const quarter_bval = obj_cust.start_quarter;
			const year_bval = obj_cust.start_year;

			if(dev_log === true){this.log.info("reading_start : " + reading_start);}
			if(dev_log === true){this.log.info("day start : " + day_bval);}
			if(dev_log === true){this.log.info("week start : " + week_bval);}
			if(dev_log === true){this.log.info("month start " + month_bval);}
			if(dev_log === true){this.log.info("quarter start " + quarter_bval);}
			if(dev_log === true){this.log.info("year start : " + year_bval);}

			// set correct naming for cost & delivery based on type
			if(obj_cust.state_type == "kWh_delivery"){
				cost_t =  ".earnings.";
				del_t = ".delivery.";
			} else {
				cost_t = ".cost.";
				del_t = ".consumption.";
			}

			if(dev_log === true){this.log.info("Delivery state set to : " + del_t);}

			if(obj_cust.consumption === true){
				if(dev_log === true){this.log.info("Start consumption calculations");}
				// Store current meter value to state
				// disabled in 0.2.26, check in later version for meter readings
				// this.setState(obj_root + del_t + ".Meter_Readings.Current_Reading", { val: calc_reading.toFixed(3) ,ack: true });
				
				// Calculate consumption
				// Weekday & current day
				state_val = ((calc_reading - day_bval) - reading_start).toFixed(3);

				if(dev_log === true){this.log.info("calculated reading day : " + state_val);}
				this.setState(obj_root + del_t + "01_current_day", { val: state_val,ack: true });
				this.setState(obj_root + del_t + "current_year.this_week." + weekdays[date.getDay()], { val: state_val ,ack: true });

				// Week
				state_val = ((calc_reading - week_bval) - reading_start).toFixed(3);
				if(dev_log === true){this.log.info("calculated reading week : " + state_val);}
				this.setState(obj_root + del_t + "02_current_week", { val: state_val,ack: true });
				this.setState(obj_root + del_t + "current_year.weeks." + this.getWeekNumber(new Date()), { val: state_val,ack: true });

				// Month
				state_val = ((calc_reading - month_bval) - reading_start).toFixed(3);
				if(dev_log === true){this.log.info("calculated reading month : " + state_val);}
				this.setState(obj_root + del_t + "03_current_month", { val: state_val,ack: true });
				this.setState(obj_root + del_t + "current_year.months." + months[date.getMonth()], { val: state_val,ack: true });

				// Quarter
				state_val = ((calc_reading - quarter_bval) - reading_start).toFixed(3);
				if(dev_log === true){this.log.info("calculated reading quarter : " + state_val);}
				this.setState(obj_root + del_t + "04_current_quarter", { val: state_val,ack: true });

				// Year
				state_val = ((calc_reading - year_bval) - reading_start).toFixed(3);
				if(dev_log === true){this.log.info("calculated reading day : " + state_val);}
				this.setState(obj_root + del_t + "05_current_year", { val: state_val,ack: true });
			}

			const day_bval_consumend = ((calc_reading - day_bval) - reading_start);
			const week_bval_consumend =  ((calc_reading - week_bval) - reading_start);
			const month_bval_consumend = ((calc_reading - month_bval) - reading_start);
			const quarter_bval_consumend = ((calc_reading - quarter_bval) - reading_start);
			const year_bval_consumend = ((calc_reading- year_bval) - reading_start);

			if(dev_log === true){this.log.info("day consumed " + day_bval_consumend);}
			if(dev_log === true){this.log.info("week consumed " + week_bval_consumend);}
			if(dev_log === true){this.log.info("month consumed " + month_bval_consumend);}
			if(dev_log === true){this.log.info("quarter consumed " + quarter_bval_consumend);}
			if(dev_log === true){this.log.info("year consumed "+ year_bval_consumend);}
			if(dev_log === true){this.log.info("objroot " + obj_root);}
			if(dev_log === true){this.log.info("cost type " + cost_t);}
			if(dev_log === true){this.log.info("delivery type " + del_t);}
			if(dev_log === true){this.log.info("example state string : " + obj_root + cost_t + "01_current_day");}
			
			if(obj_cust.costs === true){
				// Weekday & current day
				//@ts-ignore cost_unit is always a number
				state_val = (day_bval_consumend * cost_unit).toFixed(2);
				if(dev_log === true){this.log.info("calculated cost day : " + state_val);}
				this.setState(obj_root + cost_t + "01_current_day", { val: state_val,ack: true });
				this.setState(obj_root + cost_t + "current_year.this_week." + weekdays[date.getDay()], { val: state_val ,ack: true });
				
				// Week
				//@ts-ignore cost_unit is always a number
				state_val = (week_bval_consumend * cost_unit).toFixed(2);
				if(dev_log === true){this.log.info("calculated cost week : " + state_val);}
				this.setState(obj_root + cost_t + "02_current_week", { val: state_val,ack: true });
				this.setState(obj_root + cost_t + "current_year.weeks." + this.getWeekNumber(new Date()), { val: state_val,ack: true });

				// Month
				//@ts-ignore cost_unit is always a number
				state_val = (month_bval_consumend * cost_unit).toFixed(2);
				if(dev_log === true){this.log.info("calculated cost month : " + state_val);}
				this.setState(obj_root + cost_t + "03_current_month", { val: state_val,ack: true });
				this.setState(obj_root + cost_t + "current_year.months." + months[date.getMonth()], { val: state_val,ack: true });

				// Quarter
				//@ts-ignore cost_unit is always a number
				state_val = (quarter_bval_consumend * cost_unit).toFixed(2);
				if(dev_log === true){this.log.info("calculated cost quarter : " + state_val);}
				this.setState(obj_root + cost_t + "04_current_quarter", { val: state_val,ack: true });

				// Year
				//@ts-ignore cost_unit is always a number
				state_val = (year_bval_consumend * cost_unit).toFixed(2);
				if(dev_log === true){this.log.info("calculated cost year : " + state_val);}
				this.setState(obj_root + cost_t + "05_current_year", { val: state_val,ack: true });
			}
			if(dev_log === true){this.log.info("Meter Calculation executed");}
		}
	}

}

if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Sourceanalytix(options);
} else {
	// otherwise start the instance directly
	new Sourceanalytix();
}