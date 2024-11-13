require('dotenv').config();
const readline = require('readline-sync');
const RobinhoodCrypto = require('./robinhoodCrypto');
const { v4: uuidv4 } = require('uuid');

// Initialize Robinhood API Client
const robinhood = new RobinhoodCrypto();

// Function to display account information
async function displayAccountInfo() {
    const accountInfo = await robinhood.getAccount();
    console.log('\nAccount Information:');
    console.log(`Account Number: ${accountInfo.account_number}`);
    console.log(`Status: ${accountInfo.status}`);
    console.log(`Buying Power: ${accountInfo.buying_power} ${accountInfo.buying_power_currency}\n`);
}

// Function to display available trading pairs
async function displayTradingPairs() {
    const tradingPairs = await robinhood.getTradingPairs(['BTC-USD', 'ETH-USD']);
    console.log('\nAvailable Trading Pairs:');
    tradingPairs.results.forEach(pair => {
        console.log(`Symbol: ${pair.symbol}, Status: ${pair.status}`);
        console.log(`Min Order Size: ${pair.min_order_size}, Max Order Size: ${pair.max_order_size}\n`);
    });
}

// Function to display holdings
async function displayHoldings() {
    const holdings = await robinhood.getHoldings(['BTC']);
    console.log('\nHoldings:');
    holdings.results.forEach(holding => {
        console.log(`Asset: ${holding.asset_code}, Quantity: ${holding.total_quantity}`);
    });
    console.log('');
}

// Function to place an order
async function placeOrder() {
    const symbol = readline.question('Enter symbol (e.g., BTC-USD): ').toUpperCase();
    const quantity = readline.questionFloat('Enter quantity: ');

    const order = await robinhood.placeOrder(
        uuidv4(),
        'buy',
        'market',
        symbol,
        { asset_quantity: quantity.toString() }
    );

    if (order) {
        console.log('\nOrder placed successfully!\n', order);
    } else {
        console.log('\nOrder placement failed: Not enough buying power or other issue.\n');
    }
}

// Function to cancel an order
async function cancelOrder() {
    const orderId = readline.question('Enter order ID to cancel: ');

    const cancelResult = await robinhood.cancelOrder(orderId);
    if (cancelResult) {
        console.log('\nOrder canceled successfully.\n');
    } else {
        console.log('\nOrder cancellation failed: Invalid order ID or other issue.\n');
    }
}

// Main function to handle user input and CLI logic
async function main() {
    console.log('Welcome to the Crypto Trading CLI App');
    while (true) {
        console.log('\nChoose an option:');
        console.log('1. View Account Information');
        console.log('2. View Trading Pairs');
        console.log('3. View Holdings');
        console.log('4. Place an Order');
        console.log('5. Cancel an Order');
        console.log('6. Exit');

        const choice = readline.questionInt('\nEnter your choice: ');

        switch (choice) {
            case 1:
                await displayAccountInfo();
                break;
            case 2:
                await displayTradingPairs();
                break;
            case 3:
                await displayHoldings();
                break;
            case 4:
                await placeOrder();
                break;
            case 5:
                await cancelOrder();
                break;
            case 6:
                console.log('Exiting the app. Goodbye!');
                process.exit(0);
            default:
                console.log('Invalid choice. Please try again.');
        }
    }
}

main();
