// Charlee's guide to the admin. Plain words, the jobs she actually does.
export function Help() {
  return (
    <section class="help">
      <h1>How your shop admin works</h1>
      <p class="muted">Everything you used to do in GoHighLevel now happens here. Your website looks the same to customers.</p>

      <div class="card">
        <h2>Getting here</h2>
        <p>Go to <strong>beadedbychar.com.au/admin</strong> and sign in with your email and password.</p>
        <p>On your phone, add it to your home screen so it opens like an app. On iPhone: tap Share, then <em>Add to Home Screen</em>. On Android: tap ⋮, then <em>Add to Home screen</em>.</p>
        <p>Forgot your password? Tap <em>Forgot your password?</em> on the sign-in page and we’ll email you a link. Open it on the same phone or computer.</p>
      </div>

      <div class="card">
        <h2>When an order comes in</h2>
        <ol>
          <li>You get an email: <em>New order #1001</em>. The customer gets their own confirmation email automatically.</li>
          <li>Open <strong>Orders</strong>. New orders sit under <strong>Unfulfilled</strong>, and the number on the Orders tab tells you how many are waiting.</li>
          <li>Tap the order to see what they bought and where it’s going. <em>Copy address</em> copies it for your postage label.</li>
          <li>Once it’s posted, tap <strong>Mark as fulfilled</strong>. It moves to the Fulfilled tab. Tapped it by mistake? Tap it again to undo.</li>
        </ol>
        <p>The <em>Private note</em> box is just for you, e.g. a tracking number. Customers never see it.</p>
        <p>An orange <em>Check stock</em> tag means two people bought the last one at the same moment. Check you can make another, or email the customer.</p>
      </div>

      <div class="card">
        <h2>Refunds and payments</h2>
        <p>Money goes straight to your Stripe account, as before. To refund, open the order, tap <em>View payment in Stripe</em>, then <em>Refund</em> in Stripe. The order here changes to Refunded by itself.</p>
        <p>For a live sale or a custom order, send the customer a Stripe <em>Payment link</em> or <em>Invoice</em> from your Stripe dashboard.</p>
      </div>

      <div class="card">
        <h2>Products</h2>
        <p>Tap a product to change its name, description, photos, price or stock. Tap <strong>Save</strong>. The website updates about 2 minutes later. You’ll see a green bar at the top while it does.</p>
        <ul>
          <li><strong>Stock:</strong> with <em>Track stock</em> on, the number goes down by itself when someone buys. At 0 the website shows it as sold out.</li>
          <li><strong>Made to order?</strong> Tick <em>Keep selling at 0</em> and it never sells out.</li>
          <li><strong>Options</strong> like scent or colour: add the choices, and each combination gets its own price and stock. Untick <em>Available</em> on any combination you don’t make.</li>
          <li><strong>Photos:</strong> the first one is the main photo. ★ makes a photo the main one. Photos from your phone are shrunk automatically.</li>
          <li><strong>Taking something down for a while?</strong> Untick <em>Show on website</em> instead of deleting it.</li>
        </ul>
        <p><strong>Categories</strong> (Products → Categories) are the circles on the Home and Shop pages. You can rename them, change their order, add a new one and give it a picture.</p>
      </div>

      <div class="card">
        <h2>Customers and the newsletter</h2>
        <p><strong>Customers</strong> lists everyone who has ordered or joined the newsletter. You get an email whenever someone new joins. <em>Download CSV</em> gives you a spreadsheet, e.g. to import into Mailchimp.</p>
      </div>

      <div class="card">
        <h2>Going away?</h2>
        <p>Go to <strong>Settings</strong>, untick <em>Taking orders</em> and save. People can still look around, but nobody can check out until you tick it again. Settings is also where you change the shipping price and the email address new-order emails go to.</p>
      </div>

      <div class="card">
        <h2>Something not right?</h2>
        <p>Message Ben with a screenshot and he’ll sort it out.</p>
      </div>
    </section>
  );
}
