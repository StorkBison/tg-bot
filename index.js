const { Telegraf, Markup } = require("telegraf");
const { Web3 } = require("web3");
const axios = require("axios");
const { isAddress } = require("web3-validator");
const Moralis = require("moralis").default;
require("util").inspect.defaultOptions.depth = null;
require("dotenv").config();
const { BigNumber } = require("ethers");

/* Global Infos */
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const web3 = new Web3(process.env.rpcURL);
Moralis.start({ apiKey: process.env.MoralisAPI });

let registered_addresses = [];
let is_monitoring_started = false;
let chat_id;

let p_trx_hash = '';
let p_erc_hash = '';

const getERC20Transaction = async (fromTime, toTime) => {
  try {
    console.log(registered_addresses);
    const res = await axios({
      method: "POST",
      headers: {
        "Content-type": "application/json",
        Accept: "application/json",
      },
      url: "https://rpc.ankr.com/multichain/bfc15973dc8f343880edd5b2f2d2eb63cf42c9a38469607830e061c90b362fd6",
      data: {
        jsonrpc: "2.0",
        method: "ankr_getTokenTransfers",
        params: {
          address: registered_addresses,
          blockchain: ["eth", "bsc", "polygon", "arbitrum"],
          fromTimestamp: fromTime,
          toTimestamp: toTime,
        },
        id: 1,
      },
    });
    // console.log(res.data.result);
    console.log("erc res", res.data);
    return res.data.result.transfers;
  } catch {
    return [];
  }
};

const getTransaction = async (fromTime, toTime) => {
  try {
    console.log(registered_addresses);
    const res = await axios({
      method: "POST",
      headers: {
        "Content-type": "application/json",
        Accept: "application/json",
      },
      url: "https://rpc.ankr.com/multichain/bfc15973dc8f343880edd5b2f2d2eb63cf42c9a38469607830e061c90b362fd6",
      data: {
        jsonrpc: "2.0",
        method: "ankr_getTransactionsByAddress",
        params: {
          address: registered_addresses,
          blockchain: ["eth", "bsc", "polygon", "arbitrum"],
          fromTimestamp: fromTime,
          toTimestamp: toTime,
        },
        id: 1,
      },
    });
    console.log("trx res", res.data);
    return res.data.result.transactions;
  } catch {
    return [];
  }
};

const getPrice = async (address, chain) => {
  const res = await axios({
    method: "POST",
    headers: {
      "Content-type": "application/json",
      Accept: "application/json",
    },
    url: "https://rpc.ankr.com/multichain/bfc15973dc8f343880edd5b2f2d2eb63cf42c9a38469607830e061c90b362fd6",
    data: {
      jsonrpc: "2.0",
      method: "ankr_explainTokenPrice",
      params: {
        tokenAddress: address,
        blockchain: chain,
      },
      id: 1,
    },
  });
  if (res.data.result.priceEstimates.length == 1) {
    return res.data.result.priceEstimates[0].price;
  } else {
    return res.data.result.priceEstimates[2].price;
  }
};

const startTrxTrade = async () => {
  // console.log(registered_addresses);
  const currentUnixTime = Math.floor(Date.now() / 1000);
  const tenSecondsAgoUnixTime = Math.floor((Date.now() - 90000) / 1000);
  console.log(tenSecondsAgoUnixTime, currentUnixTime);
  const coinTx = await getTransaction(tenSecondsAgoUnixTime, currentUnixTime);
  if (coinTx.length == 0) {
    return;
  }

  for (let key of coinTx) {
    const trade_value = BigNumber.from(key.value);
    if (parseFloat(trade_value.toString()) != 0) {
      if(key.hash.toString() == p_trx_hash) {
        continue;
      }
      p_trx_hash = key.hash.toString();
      let price = 0;
      if (key.blockchain.toString() == "eth") {
        price = await getPrice(
          "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          key.blockchain
        );
      } else if (key.blockchain.toString() == "bsc") {
        price = await getPrice(
          "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
          key.blockchain
        );
      } else if (key.blockchain.toString() == "arbitrum") {
        price = await getPrice(
          "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
          key.blockchain
        );
      }
      else {
        price = await getPrice(
          "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
          key.blockchain
        );
      }
      console.log("price", price);
      const trade_USD =
        (parseFloat(trade_value.toString()) / 10 ** 18) * parseFloat(price);
      if (trade_USD < 100) {
        await bot.telegram.sendSticker(
          chat_id,
          "CAACAgIAAxkBAAEKi-hlL15AVDKJ3Ue55IqdDJEY50vKjgACBxcAApMUUUngrVGLAcbnvzAE"
        );
      } else if (trade_USD > 100 && trade_USD < 1000) {
        await bot.telegram.sendSticker(
          chat_id,
          "CAACAgIAAxkBAAEKi-plL15Gd7JCR1IrruIKDrvvFo9nRAACoBcAAt-0IEkggKwiuyDGyTAE"
        );
      } else {
        await bot.telegram.sendSticker(
          chat_id,
          "CAACAgIAAxkBAAEKi-ZlL14q8JYb-v58SCAhr6MvOjd_xAACCRcAAq_pwUljAgv3aWqwNzAE"
        );
      }
      let messageContent = "<b>Trade Alert</b>\n\n";
      messageContent +=
        "🔗<b>Chain: </b>" + key.blockchain.toString().toUpperCase() + "\n";
      messageContent += "🚀<b>From: </b>" + key.from + "\n";
      messageContent += "🛰<b>To: </b>" + key.to + "\n";
      messageContent +=
        "💰<b>Amount: </b>" +
        (parseFloat(trade_value.toString()) / 10 ** 18).toString() +
        "\n";
      await bot.telegram.sendMessage(chat_id, messageContent, {
        parse_mode: "HTML",
      });
    }
  }
};

const startErcTrade = async () => {
  console.log(registered_addresses);
  const currentUnixTime = Math.floor(Date.now() / 1000);
  const tenSecondsAgoUnixTime = Math.floor((Date.now() - 90000) / 1000);
  console.log(tenSecondsAgoUnixTime, currentUnixTime);
  const erc20Tx = await getERC20Transaction(
    tenSecondsAgoUnixTime,
    currentUnixTime
  );
  if (erc20Tx.length == 0) {
    return;
  }

  for (let key of erc20Tx) {
    if(key.transactionHash.toString() == p_erc_hash) {
      continue;
    }
    p_erc_hash = key.transactionHash.toString();
    const trade_value = parseFloat(key.value);
    const price = await getPrice(key.contractAddress, key.blockchain);
    console.log(parseFloat(trade_value.toString()), price);
    const trade_USD = parseFloat(trade_value.toString()) * parseFloat(price);
    if (trade_USD < 100) {
      await bot.telegram.sendSticker(
        chat_id,
        "CAACAgIAAxkBAAEKi-hlL15AVDKJ3Ue55IqdDJEY50vKjgACBxcAApMUUUngrVGLAcbnvzAE"
      );
    } else if (trade_USD > 100 && trade_USD < 1000) {
      await bot.telegram.sendSticker(
        chat_id,
        "CAACAgIAAxkBAAEKi-plL15Gd7JCR1IrruIKDrvvFo9nRAACoBcAAt-0IEkggKwiuyDGyTAE"
      );
    } else {
      await bot.telegram.sendSticker(
        chat_id,
        "CAACAgIAAxkBAAEKi-ZlL14q8JYb-v58SCAhr6MvOjd_xAACCRcAAq_pwUljAgv3aWqwNzAE"
      );
    }
    let messageContent = "<b>Trade Alert</b>\n\n";
    messageContent +=
      "🔗<b>Chain: </b>" + key.blockchain.toString().toUpperCase() + "\n";
    messageContent += "🚀<b>From: </b>" + key.fromAddress + "\n";
    messageContent += "🛰<b>To: </b>" + key.toAddress + "\n";
    messageContent += "📀<b>Token: </b>" + key.tokenName + "\n";
    messageContent +=
      "💰<b>Amount: </b>" + String(trade_value).toString() + "\n";
    await bot.telegram.sendMessage(chat_id, messageContent, {
      parse_mode: "HTML",
    });
  }
};

async function isMetamaskAddress(address) {
  // Check if the address is a valid Ethereum address
  if (!isAddress(address)) {
    return false;
  }

  // Check if the address is a contract address (Metamask does not support contract interactions)
  const code = await web3.eth.getCode(address);
  if (code !== "0x") {
    return false;
  }

  // All checks passed, the address is a Metamask wallet address
  return true;
}

bot.start(async (ctx) => {
  await ctx.reply("Welcome to Bot!");
});

bot.telegram.setMyCommands([
  {
    command: "register",
    description: "register the address to monitor",
  },
  {
    command: "delete",
    description: "delete the address to monitor",
  },
  {
    command: "list_address",
    description: "list of addresses to monitor",
  },
]);

bot.command("list_address", async (ctx) => {
  try {
    let HTMLmsg = "<b>Registered Addresses</b>\n\n";
    for (let i = 0; i < registered_addresses.length; i++) {
      HTMLmsg += `[${i}]: ${registered_addresses[i]}\n`;
    }
    await ctx.replyWithHTML(HTMLmsg);
  } catch (err) {
    console.log(err);
    await ctx.reply("Something went wrong, please try again in some minutes");
  }
});

bot.command("delete", async (ctx) => {
  try {
    let texts = ctx.update.message.text.split(" ");
    if (texts.length === 1) {
      await ctx.reply("Please try /delete <wallet number>");
      return;
    }
    let number =  registered_addresses.indexOf(texts[1]); //parseInt(texts[1]);
    registered_addresses.splice(number, 1);
    let HTMLmsg = "Deleted Successfully";
    await ctx.replyWithHTML(HTMLmsg);

    HTMLmsg = "<b>Now Registered Addresses</b>\n\n";
    for (let i = 0; i < registered_addresses.length; i++) {
      HTMLmsg += `[${i}]: ${registered_addresses[i]}\n`;
    }
    await ctx.replyWithHTML(HTMLmsg);
  } catch (err) {
    console.log(err);
    await ctx.reply("Something went wrong, please try again in some minutes");
  }
});

bot.command("register", async (ctx) => {
  try {
    chat_id = ctx.update.message.chat.id;
    let texts = ctx.update.message.text.split(" ");
    if (texts.length === 1) {
      await ctx.reply("Please try /register <wallet_address>");
      return;
    }
    let walletAddress = texts[1];
    const isMetamask = await isMetamaskAddress(walletAddress);
    console.log('in ', isMetamask)
    if (!isMetamask) {
      await ctx.replyWithSticker(
        "CAACAgIAAxkBAAEKi-xlL2lLF8TrTk8hdzKgIrTwSesZ7wACyxQAAt2wUUlMYGw0MqQdYTAE"
      );
      await ctx.reply("Wallet Address is not matched");
      return;
    }
    registered_addresses.push(walletAddress);
    await ctx.reply("Registered Successfully!");

    let HTMLmsg = "<b>Now Registered Addresses</b>\n\n";
    for (let i = 0; i < registered_addresses.length; i++) {
      HTMLmsg += `[${i}]: ${registered_addresses[i]}\n`;
    }
    await ctx.replyWithHTML(HTMLmsg);
    if (!is_monitoring_started) {
      is_monitoring_started = true;
      console.log("Tracking is started");
      ctx.replyWithSticker(
        "CAACAgIAAxkBAAEKi_ZlL27YNbR2DU7S7U7G--9HmQtjLwAC7hQAAuNVUEk4S4qtAhNhvDAE"
      );
      setInterval(startTrxTrade, 20000);
      setInterval(startErcTrade, 20000);
    }
  } catch (err) {
    console.log(err);
    await ctx.reply("Something went wrong, please try again in some minutes");
  }
});

bot.launch();
